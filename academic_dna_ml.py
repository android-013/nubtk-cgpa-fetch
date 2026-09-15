"""Academic DNA fingerprinting with unsupervised machine learning.

The input CSV is expected to contain one student per row and repeated course
slots such as S1_CODE, S1_GRADE, S1_POINT, S1_CREDIT, ..., S78_*.

Example:
    python academic_dna_ml.py \
        --input "C:\\path\\to\\clean.csv" \
        --output-dir academic_dna_output \
        --clusters 4

The script writes student-level features, semester-level data, cluster
assignments, cluster summaries, PCA coordinates, and PNG visualizations.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.impute import SimpleImputer
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:  # CSV outputs still work when plotting dependencies are absent.
    plt = None

try:
    from scipy.cluster.hierarchy import dendrogram, linkage
except ImportError:  # The dendrogram is optional; hierarchical labels still work.
    dendrogram = None
    linkage = None


GRADE_TO_POINT: Dict[str, float] = {
    "A+": 4.00,
    "A": 3.75,
    "A-": 3.50,
    "B+": 3.25,
    "B": 3.00,
    "B-": 2.75,
    "C+": 2.50,
    "C": 2.25,
    "D": 2.00,
    "F": 0.00,
}


def text(value: Any) -> str:
    """Return a clean string for a CSV cell."""

    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def number(value: Any) -> Optional[float]:
    """Parse a numeric cell, returning None for blank or invalid values."""

    raw = text(value).replace(",", "")
    if not raw:
        return None
    try:
        result = float(raw)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def normalize_grade(value: Any) -> str:
    """Normalize grades such as 'A -' to 'A-' and 'Reg.' to 'REG'."""

    grade = text(value).upper().replace(" ", "")
    return grade.replace(".", "")


def normalize_course_code(value: Any) -> str:
    """Remove spaces/hyphens so equivalent course-code spellings match."""

    return re.sub(r"[^A-Z0-9]", "", text(value).upper())


def parse_student_id(value: Any) -> Dict[str, Any]:
    """Parse department, enrollment year/term, and serial from a student ID.

    For example, CSE160320001 becomes department=CSE, enrollment year=2016,
    enrollment term code=03, and serial=20001.
    """

    raw = re.sub(r"\s+", "", text(value))
    match = re.match(
        r"^(?P<department>[A-Za-z]+)(?P<yy>\d{2})(?P<term>\d{2})(?P<serial>\d+)$",
        raw,
    )
    if not match:
        return {
            "department": "UNKNOWN",
            "enrollment_year": np.nan,
            "enrollment_semester_code": np.nan,
            "enrollment_term": "Unknown",
            "student_serial": "",
        }

    term_code = int(match.group("term"))
    term_name = {1: "Spring", 3: "Fall"}.get(term_code, f"Code {term_code:02d}")
    return {
        "department": match.group("department").upper(),
        "enrollment_year": 2000 + int(match.group("yy")),
        "enrollment_semester_code": term_code,
        "enrollment_term": term_name,
        "student_serial": match.group("serial"),
    }


def parse_course_code(value: Any) -> Dict[str, Any]:
    """Parse course prefix, term code, and expected overall semester.

    Standard codes use 11, 12, 21, 22, ... where the first digit is academic
    year and the second digit is semester within that year. Some observed
    legacy codes use 01, 02, ... as the overall semester. Both are supported.
    """

    code = normalize_course_code(value)
    match = re.search(r"(?P<term>\d{2})(?P<number>\d{2})$", code)
    if not match:
        return {"course_code": code, "course_prefix": "", "expected_semester": np.nan}

    term_code = int(match.group("term"))
    first_digit, second_digit = divmod(term_code, 10)
    if first_digit == 0:
        # Legacy overall-semester format: 01 -> semester 1, 02 -> semester 2.
        expected_semester = second_digit if second_digit > 0 else np.nan
    else:
        # Standard year/semester format, with a sensible fallback for codes
        # such as 13 or 23 that occur in the supplied data.
        expected_semester = (first_digit - 1) * 2 + second_digit

    return {
        "course_code": code,
        "course_prefix": code[: match.start()],
        "course_term_code": term_code,
        "course_number": int(match.group("number")),
        "expected_semester": expected_semester,
    }


def course_point(grade: str, point: Optional[float]) -> Optional[float]:
    """Use the numeric point when present, otherwise map the letter grade."""

    if point is not None:
        return point
    return GRADE_TO_POINT.get(grade)


def passed_status(
    grade: str, point: Optional[float], pass_point: float
) -> Optional[bool]:
    """Return True/False when pass/fail can be determined, else None."""

    resolved_point = course_point(grade, point)
    if resolved_point is not None:
        return resolved_point >= pass_point
    return None


def weighted_mean(values: Sequence[float], weights: Sequence[float]) -> float:
    """Credit-weighted mean, falling back to an unweighted mean."""

    if not values:
        return float("nan")
    value_array = np.asarray(values, dtype=float)
    weight_array = np.asarray(weights, dtype=float)
    positive = np.isfinite(weight_array) & (weight_array > 0)
    if positive.any() and float(weight_array[positive].sum()) > 0:
        return float(np.average(value_array[positive], weights=weight_array[positive]))
    return float(np.nanmean(value_array))


def slope(x: Sequence[float], y: Sequence[float]) -> float:
    """Return a least-squares slope, or zero when there is one observation."""

    if len(y) < 2:
        return 0.0
    return float(np.polyfit(np.asarray(x, dtype=float), np.asarray(y, dtype=float), 1)[0])


def discover_slots(columns: Iterable[str]) -> List[int]:
    """Find all S<number>_CODE course slots in the wide input file."""

    slots = set()
    for column in columns:
        match = re.fullmatch(r"S(\d+)_CODE", str(column).upper())
        if match:
            slots.add(int(match.group(1)))
    if not slots:
        raise ValueError("No course slots found. Expected columns such as S1_CODE and S1_GRADE.")
    return sorted(slots)


def extract_student_records(
    frame: pd.DataFrame, slots: Sequence[int], pass_point: float
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Create student features, semester summaries, and course-attempt rows."""

    feature_rows: List[Dict[str, Any]] = []
    semester_rows: List[Dict[str, Any]] = []
    attempt_rows: List[Dict[str, Any]] = []

    for _, source in frame.iterrows():
        student_id = text(source.get("ID"))
        parsed_id = parse_student_id(student_id)
        department = parsed_id["department"]
        degree_semesters = 10 if department.startswith("ARCH") else 8

        attempts: List[Dict[str, Any]] = []
        semester_stats: Dict[int, Dict[str, Any]] = defaultdict(
            lambda: {
                "points": [],
                "credits": [],
                "credits_attempted": 0.0,
                "credits_completed": 0.0,
                "course_count": 0,
                "failed_count": 0,
            }
        )

        for slot in slots:
            raw_code = text(source.get(f"S{slot}_CODE"))
            if not raw_code:
                continue
            parsed_course = parse_course_code(raw_code)
            grade = normalize_grade(source.get(f"S{slot}_GRADE"))
            raw_point = number(source.get(f"S{slot}_POINT"))
            point = course_point(grade, raw_point)
            credit = number(source.get(f"S{slot}_CREDIT"))
            credit_value = max(credit or 0.0, 0.0)
            is_passed = passed_status(grade, raw_point, pass_point)
            attempt = {
                "student_id": student_id,
                "name": text(source.get("NAME")),
                "department": department,
                "attempt_order": slot,
                "course_code": parsed_course["course_code"],
                "course_prefix": parsed_course["course_prefix"],
                "course_title": text(source.get(f"S{slot}_TITLE")),
                "course_term_code": parsed_course.get("course_term_code", np.nan),
                "course_number": parsed_course.get("course_number", np.nan),
                "expected_semester": parsed_course.get("expected_semester", np.nan),
                "credit": credit_value,
                "grade": grade,
                "point": point if point is not None else np.nan,
                "passed": is_passed,
            }
            attempts.append(attempt)

            expected_semester = parsed_course.get("expected_semester")
            if isinstance(expected_semester, (int, float, np.integer, np.floating)) and not pd.isna(
                expected_semester
            ):
                semester = int(expected_semester)
                stat = semester_stats[semester]
                stat["course_count"] += 1
                stat["credits_attempted"] += credit_value
                if point is not None:
                    stat["points"].append(point)
                    stat["credits"].append(credit_value)
                if is_passed is False:
                    stat["failed_count"] += 1
                if is_passed is True:
                    stat["credits_completed"] += credit_value

        code_counts = Counter(a["course_code"] for a in attempts if a["course_code"])
        previous_points: Dict[str, Optional[float]] = {}
        previous_expected_semester = 0
        out_of_sequence_count = 0
        retake_deltas: List[float] = []
        retake_improved_count = 0

        for attempt in attempts:
            code = attempt["course_code"]
            occurrence = sum(1 for a in attempts if a["course_code"] == code and a["attempt_order"] <= attempt["attempt_order"])
            attempt["attempt_number_for_code"] = occurrence
            attempt["is_retake"] = bool(code and occurrence > 1)

            expected = attempt["expected_semester"]
            if not pd.isna(expected):
                expected_int = int(expected)
                attempt["is_out_of_sequence"] = expected_int < previous_expected_semester
                if attempt["is_out_of_sequence"]:
                    out_of_sequence_count += 1
                previous_expected_semester = max(previous_expected_semester, expected_int)
            else:
                attempt["is_out_of_sequence"] = False

            prior_point = previous_points.get(code)
            current_point = attempt["point"]
            if attempt["is_retake"] and prior_point is not None and not pd.isna(current_point):
                delta = float(current_point) - float(prior_point)
                attempt["grade_change_from_previous"] = delta
                retake_deltas.append(delta)
                if delta > 0:
                    retake_improved_count += 1
            else:
                attempt["grade_change_from_previous"] = np.nan
            if not pd.isna(current_point):
                previous_points[code] = float(current_point)

            attempt_rows.append(attempt)

        points = [float(a["point"]) for a in attempts if not pd.isna(a["point"])]
        credits = [float(a["credit"]) for a in attempts if not pd.isna(a["point"])]
        average_course_grade = weighted_mean(points, credits)
        source_cgpa = number(source.get("CGPA"))
        computed_cgpa = average_course_grade
        final_cgpa = source_cgpa if source_cgpa is not None else computed_cgpa

        passed_attempts = [a for a in attempts if a["passed"] is True]
        failed_attempts = [a for a in attempts if a["passed"] is False]
        attempted_credits = sum(float(a["credit"]) for a in attempts if float(a["credit"]) > 0)
        completed_credits = sum(
            float(a["credit"]) for a in passed_attempts if float(a["credit"]) > 0
        )
        unique_failed_courses = {a["course_code"] for a in failed_attempts if a["course_code"]}
        repeated_courses = sum(1 for count in code_counts.values() if count > 1)
        retake_count = sum(max(count - 1, 0) for count in code_counts.values())

        observed_course_semesters = [
            int(a["expected_semester"])
            for a in attempts
            if not pd.isna(a["expected_semester"])
        ]
        degree_semesters = max(degree_semesters, max(observed_course_semesters, default=degree_semesters))

        semester_gpa: Dict[int, float] = {}
        semester_credits: Dict[int, float] = {}
        semester_completed_credits: Dict[int, float] = {}
        for semester in range(1, degree_semesters + 1):
            stat = semester_stats.get(semester, {})
            points_for_semester = stat.get("points", [])
            credits_for_semester = stat.get("credits", [])
            gpa = weighted_mean(points_for_semester, credits_for_semester)
            semester_gpa[semester] = gpa
            semester_credits[semester] = float(stat.get("credits_attempted", 0.0))
            semester_completed_credits[semester] = float(stat.get("credits_completed", 0.0))
            semester_rows.append(
                {
                    "ID": student_id,
                    "NAME": text(source.get("NAME")),
                    "department": department,
                    "semester": semester,
                    "semester_gpa": gpa,
                    "credits_attempted": semester_credits[semester],
                    "credits_completed": semester_completed_credits[semester],
                    "course_count": int(stat.get("course_count", 0)),
                    "failed_course_count": int(stat.get("failed_count", 0)),
                    "observed": not math.isnan(gpa),
                }
            )

        observed_semesters = [s for s, gpa in semester_gpa.items() if not math.isnan(gpa)]
        observed_gpas = [semester_gpa[s] for s in observed_semesters]
        observed_credits = [semester_credits[s] for s in observed_semesters]
        observed_completed_credits = [semester_completed_credits[s] for s in observed_semesters]
        first_two = observed_gpas[:2]
        last_two = observed_gpas[-2:]
        semester_gpa_slope = slope(observed_semesters, observed_gpas)
        credit_load_slope = slope(observed_semesters, observed_credits)
        credit_completion_slope = slope(observed_semesters, observed_completed_credits)

        feature: Dict[str, Any] = {
            "ID": student_id,
            "NAME": text(source.get("NAME")),
            **parsed_id,
            "degree_semesters": degree_semesters,
            "source_cgpa": source_cgpa if source_cgpa is not None else np.nan,
            "final_cgpa": final_cgpa,
            "computed_cgpa": computed_cgpa,
            "cgpa_reconciliation_gap": (
                source_cgpa - computed_cgpa
                if source_cgpa is not None and not math.isnan(computed_cgpa)
                else np.nan
            ),
            "course_count": len(attempts),
            "unique_course_count": len(code_counts),
            "average_course_grade": average_course_grade,
            "failed_course_count": len(failed_attempts),
            "failed_unique_course_count": len(unique_failed_courses),
            "course_fail_rate": len(failed_attempts) / max(len(points), 1),
            "passed_course_count": len(passed_attempts),
            "course_pass_rate": len(passed_attempts) / max(len(points), 1),
            "attempted_credits": attempted_credits,
            "completed_credits": completed_credits,
            "credit_completion_ratio": (
                completed_credits / attempted_credits if attempted_credits > 0 else np.nan
            ),
            "retake_count": retake_count,
            "repeated_course_count": repeated_courses,
            "retake_improved_count": retake_improved_count,
            "retake_improvement_rate": (
                float(np.mean(retake_deltas)) if retake_deltas else 0.0
            ),
            "out_of_sequence_attempts": out_of_sequence_count,
            "out_of_sequence_rate": out_of_sequence_count / max(len(attempts), 1),
            "unknown_grade_count": sum(1 for a in attempts if pd.isna(a["point"])),
            "observed_semester_count": len(observed_semesters),
            "semester_observation_ratio": len(observed_semesters) / degree_semesters,
            "max_observed_semester": max(observed_semesters, default=np.nan),
            "semester_gpa_std": float(np.std(observed_gpas)) if observed_gpas else np.nan,
            "grade_improvement_rate": semester_gpa_slope,
            "first_to_last_gpa_change": (
                observed_gpas[-1] - observed_gpas[0] if observed_gpas else np.nan
            ),
            "first_semester_gpa": observed_gpas[0] if observed_gpas else np.nan,
            "last_semester_gpa": observed_gpas[-1] if observed_gpas else np.nan,
            "early_gpa": float(np.mean(first_two)) if first_two else np.nan,
            "late_gpa": float(np.mean(last_two)) if last_two else np.nan,
            "credit_load_slope": credit_load_slope,
            "credit_completion_slope": credit_completion_slope,
        }
        for semester in range(1, degree_semesters + 1):
            feature[f"semester_{semester}_gpa"] = semester_gpa[semester]
            feature[f"semester_{semester}_credits"] = semester_credits[semester]
            feature[f"semester_{semester}_completed_credits"] = semester_completed_credits[semester]
        feature_rows.append(feature)

    return pd.DataFrame(feature_rows), pd.DataFrame(semester_rows), pd.DataFrame(attempt_rows)


def hierarchical_model(n_clusters: int, matrix: np.ndarray) -> AgglomerativeClustering:
    """Create an agglomerative model across sklearn versions."""

    try:
        return AgglomerativeClustering(n_clusters=n_clusters, metric="euclidean", linkage="ward")
    except TypeError:  # sklearn < 1.2 used affinity instead of metric.
        return AgglomerativeClustering(n_clusters=n_clusters, affinity="euclidean", linkage="ward")


def finite_metric(row: Mapping[str, Any], column: str, default: float = 0.0) -> float:
    value = row.get(column, default)
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def semantic_profile_names(centroids: pd.DataFrame, n_clusters: int) -> Dict[int, str]:
    """Give four K-Means groups human-readable heuristic names.

    The names are relative to the fitted centroids, not ground-truth labels.
    """

    cluster_ids = [int(x) for x in centroids.index.tolist()]
    if n_clusters != 4 or len(cluster_ids) != 4:
        return {cluster_id: f"Cluster {cluster_id + 1}" for cluster_id in cluster_ids}

    performance_column = (
        "average_course_grade" if "average_course_grade" in centroids.columns else "final_cgpa"
    )
    low_performer = min(
        cluster_ids, key=lambda c: finite_metric(centroids.loc[c], performance_column, 0.0)
    )
    remaining = [c for c in cluster_ids if c != low_performer]
    slope_column = "grade_improvement_rate"
    late_bloomer = max(remaining, key=lambda c: finite_metric(centroids.loc[c], slope_column))
    remaining = [c for c in remaining if c != late_bloomer]
    declining = min(remaining, key=lambda c: finite_metric(centroids.loc[c], slope_column))
    consistent = next(c for c in remaining if c != declining)
    return {
        low_performer: "Struggling Students",
        late_bloomer: "Late Bloomers",
        declining: "Declining Performers",
        consistent: "Consistent Performers",
    }


def make_cluster_summary(
    features: pd.DataFrame,
    feature_columns: Sequence[str],
    labels: Sequence[int],
    method: str,
) -> Tuple[pd.DataFrame, Dict[int, str]]:
    """Return centroid metrics and profile-name mapping for one method."""

    work = features.loc[:, list(feature_columns)].copy()
    work["cluster"] = np.asarray(labels, dtype=int)
    centroids = work.groupby("cluster", sort=True)[list(feature_columns)].mean()
    names = semantic_profile_names(centroids, len(centroids))
    records: List[Dict[str, Any]] = []
    counts = work["cluster"].value_counts().to_dict()
    for cluster_id, centroid in centroids.iterrows():
        record: Dict[str, Any] = {
            "method": method,
            "cluster": int(cluster_id),
            "profile_name": names[int(cluster_id)],
            "student_count": int(counts.get(cluster_id, 0)),
        }
        record.update(centroid.to_dict())
        records.append(record)
    return pd.DataFrame(records), names


def save_pca_plot(
    coordinates: pd.DataFrame,
    output_path: Path,
    variance: Sequence[float],
) -> None:
    """Save a side-by-side PCA scatterplot for K-Means and hierarchical labels."""

    if plt is None:
        return
    fig, axes = plt.subplots(1, 2, figsize=(15, 6), dpi=160)
    color_names = sorted(
        set(coordinates["kmeans_profile"].astype(str))
        | set(coordinates["hierarchical_profile"].astype(str))
    )
    colors = {name: plt.cm.tab10(i % 10) for i, name in enumerate(color_names)}
    x_label = f"PC1 ({variance[0] * 100:.1f}% variance)"
    y_label = f"PC2 ({variance[1] * 100:.1f}% variance)"
    for axis, label_column, title in [
        (axes[0], "kmeans_profile", "K-Means profiles"),
        (axes[1], "hierarchical_profile", "Hierarchical profiles"),
    ]:
        for name in sorted(coordinates[label_column].astype(str).unique()):
            subset = coordinates[coordinates[label_column].astype(str) == name]
            axis.scatter(
                subset["PC1"],
                subset["PC2"],
                s=12,
                alpha=0.62,
                color=colors[name],
                label=name,
                edgecolors="none",
            )
        axis.set_title(title)
        axis.set_xlabel(x_label)
        axis.set_ylabel(y_label)
        axis.grid(alpha=0.2)
        axis.legend(fontsize=8, loc="best")
    fig.suptitle("Academic DNA fingerprinting: PCA projection", fontsize=14)
    fig.tight_layout()
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)


def save_dendrogram_plot(
    matrix: np.ndarray,
    coordinates: pd.DataFrame,
    output_path: Path,
    max_points: int = 500,
    random_state: int = 42,
) -> int:
    """Save a sampled hierarchical dendrogram and return sample size."""

    if plt is None or linkage is None or dendrogram is None:
        return 0
    sample_size = min(max_points, matrix.shape[0])
    rng = np.random.default_rng(random_state)
    sample_indices = np.sort(rng.choice(matrix.shape[0], size=sample_size, replace=False))
    linked = linkage(matrix[sample_indices], method="ward", metric="euclidean")
    fig, axis = plt.subplots(figsize=(15, 7), dpi=160)
    dendrogram(linked, no_labels=sample_size > 120, ax=axis, color_threshold=None)
    axis.set_title(f"Hierarchical clustering dendrogram (sample of {sample_size:,} students)")
    axis.set_xlabel("Sampled students")
    axis.set_ylabel("Ward linkage distance")
    fig.tight_layout()
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)
    return sample_size


def run_analysis(
    input_path: Path,
    output_dir: Path,
    n_clusters: int = 4,
    pass_point: float = 2.0,
    random_state: int = 42,
) -> Dict[str, Any]:
    """Run feature extraction, clustering, PCA, and output generation."""

    output_dir.mkdir(parents=True, exist_ok=True)
    frame = pd.read_csv(input_path, dtype=str, keep_default_na=False, na_filter=False)
    if "ID" not in frame.columns:
        raise ValueError("The input CSV must contain an ID column.")
    slots = discover_slots(frame.columns)
    features, semester_data, attempt_data = extract_student_records(frame, slots, pass_point)
    if len(features) < 3:
        raise ValueError("At least three students are required for clustering.")
    if n_clusters < 2 or n_clusters >= len(features):
        raise ValueError(
            f"clusters must be at least 2 and less than the number of students ({len(features)})."
        )

    excluded_from_clustering = {
        "ID",
        "NAME",
        "department",
        "enrollment_year",
        "enrollment_semester_code",
        "enrollment_term",
        "student_serial",
        "degree_semesters",
    }
    candidate_columns = [
        column
        for column in features.columns
        if column not in excluded_from_clustering
        and pd.api.types.is_numeric_dtype(features[column])
        and features[column].notna().any()
        and features[column].nunique(dropna=True) > 1
    ]
    if len(candidate_columns) < 2:
        raise ValueError("Fewer than two usable numeric academic features were found.")

    feature_matrix = features[candidate_columns].to_numpy(dtype=float)
    imputer = SimpleImputer(strategy="median", add_indicator=True)
    matrix_imputed = imputer.fit_transform(feature_matrix)
    scaler = StandardScaler()
    matrix_scaled = scaler.fit_transform(matrix_imputed)

    kmeans = KMeans(n_clusters=n_clusters, n_init=50, random_state=random_state)
    kmeans_labels = kmeans.fit_predict(matrix_scaled)
    hierarchical = hierarchical_model(n_clusters, matrix_scaled)
    hierarchical_labels = hierarchical.fit_predict(matrix_scaled)

    pca_components = min(2, matrix_scaled.shape[1])
    pca = PCA(n_components=pca_components, random_state=random_state)
    pca_matrix = pca.fit_transform(matrix_scaled)
    if pca_components == 1:
        pca_matrix = np.column_stack([pca_matrix[:, 0], np.zeros(len(features))])
        variance = [float(pca.explained_variance_ratio_[0]), 0.0]
    else:
        variance = [float(x) for x in pca.explained_variance_ratio_[:2]]

    kmeans_summary, kmeans_names = make_cluster_summary(
        features, candidate_columns, kmeans_labels, "K-Means"
    )
    hierarchical_summary, hierarchical_names = make_cluster_summary(
        features, candidate_columns, hierarchical_labels, "Hierarchical"
    )
    cluster_summary = pd.concat([kmeans_summary, hierarchical_summary], ignore_index=True)

    coordinates = pd.DataFrame(
        {
            "ID": features["ID"],
            "NAME": features["NAME"],
            "department": features["department"],
            "PC1": pca_matrix[:, 0],
            "PC2": pca_matrix[:, 1],
            "kmeans_cluster": kmeans_labels,
            "kmeans_profile": [kmeans_names[int(x)] for x in kmeans_labels],
            "hierarchical_cluster": hierarchical_labels,
            "hierarchical_profile": [hierarchical_names[int(x)] for x in hierarchical_labels],
        }
    )
    assignments = coordinates.copy()
    assignments["final_cgpa"] = features["final_cgpa"]
    assignments["average_course_grade"] = features["average_course_grade"]
    assignments["grade_improvement_rate"] = features["grade_improvement_rate"]
    assignments["failed_course_count"] = features["failed_course_count"]
    assignments["credit_completion_ratio"] = features["credit_completion_ratio"]

    silhouette_rows: List[Dict[str, Any]] = []
    max_candidate = min(8, len(features) - 1)
    for candidate_k in range(2, max_candidate + 1):
        candidate_model = KMeans(n_clusters=candidate_k, n_init=20, random_state=random_state)
        candidate_labels = candidate_model.fit_predict(matrix_scaled)
        silhouette_rows.append(
            {
                "k": candidate_k,
                "silhouette_score": float(silhouette_score(matrix_scaled, candidate_labels)),
            }
        )
    silhouette_data = pd.DataFrame(silhouette_rows)

    department_summary = (
        assignments.groupby(["department", "kmeans_profile"], dropna=False)
        .size()
        .reset_index(name="student_count")
        .sort_values(["department", "student_count"], ascending=[True, False])
    )

    features.to_csv(output_dir / "student_features.csv", index=False)
    semester_data.to_csv(output_dir / "semester_gpa_long.csv", index=False)
    attempt_data.to_csv(output_dir / "course_attempts.csv", index=False)
    assignments.to_csv(output_dir / "student_clusters.csv", index=False)
    cluster_summary.to_csv(output_dir / "cluster_centroids.csv", index=False)
    coordinates.to_csv(output_dir / "pca_coordinates.csv", index=False)
    silhouette_data.to_csv(output_dir / "silhouette_scores.csv", index=False)
    department_summary.to_csv(output_dir / "department_profile_summary.csv", index=False)

    dendrogram_sample_size = save_dendrogram_plot(
        matrix_scaled, coordinates, output_dir / "hierarchical_dendrogram.png", random_state=random_state
    )
    if plt is not None:
        save_pca_plot(coordinates, output_dir / "pca_clusters.png", variance)

    best_k = None
    if not silhouette_data.empty:
        best_k = int(silhouette_data.loc[silhouette_data["silhouette_score"].idxmax(), "k"])
    summary = {
        "input_file": str(input_path),
        "student_count": int(len(features)),
        "course_slot_count": int(len(slots)),
        "course_attempt_count": int(len(attempt_data)),
        "cluster_count": int(n_clusters),
        "pass_point": float(pass_point),
        "usable_feature_count": int(len(candidate_columns)),
        "usable_features": candidate_columns,
        "departments": {
            str(key): int(value) for key, value in features["department"].value_counts().items()
        },
        "kmeans_profile_names": {str(k): v for k, v in kmeans_names.items()},
        "hierarchical_profile_names": {str(k): v for k, v in hierarchical_names.items()},
        "pca_explained_variance_ratio": variance,
        "silhouette_recommended_k": best_k,
        "dendrogram_sample_size": dendrogram_sample_size,
        "notes": [
            "S-number order is treated as attempt order, as requested.",
            "Repeated normalized course codes are counted as retakes/improvement attempts.",
            "A course is failed when its point is below pass_point; D=2.0 is passing by default.",
            "Four profile names are heuristic labels assigned from relative cluster centroids.",
            "Missing future semesters are median-imputed for clustering, with observation counts retained as features.",
        ],
    }
    (output_dir / "analysis_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("clean.csv"),
        help="Path to clean.csv (default: clean.csv in the current directory).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("academic_dna_output"),
        help="Directory for CSV, JSON, and PNG outputs.",
    )
    parser.add_argument(
        "--clusters",
        type=int,
        default=4,
        help="Number of K-Means and hierarchical clusters (default: 4).",
    )
    parser.add_argument(
        "--pass-point",
        type=float,
        default=2.0,
        help="Minimum grade point treated as passing (default: 2.0).",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random seed for reproducible K-Means/PCA sampling.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if not args.input.exists():
        parser.error(f"Input file not found: {args.input}")
    summary = run_analysis(
        input_path=args.input,
        output_dir=args.output_dir,
        n_clusters=args.clusters,
        pass_point=args.pass_point,
        random_state=args.random_state,
    )
    print(f"Analyzed {summary['student_count']:,} students from {args.input}")
    print(f"Wrote results to {args.output_dir.resolve()}")
    if summary["silhouette_recommended_k"] is not None:
        print(f"Silhouette-based suggested k: {summary['silhouette_recommended_k']}")
    print("Default k=4 profile names are heuristic; review cluster_centroids.csv before interpretation.")


if __name__ == "__main__":
    main()
