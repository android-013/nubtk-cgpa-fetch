from itertools import permutations
from pathlib import Path
import re

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

GROUPS = [
    "Group 1: High Achievers",
    "Group 2: Late Bloomers",
    "Group 3: Declining Performers",
    "Group 4: Struggling Students",
    "Group 5: The Comeback",
    "Group 6: Peaked too soon",
    "Group 7: Heart monitor",
]

GRADE_POINTS = {
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

FEATURES = [
    "mean_grade",
    "first_grade",
    "middle_grade",
    "last_grade",
    "grade_volatility",
    "change_volatility",
    "early_peak",
    "fail_rate",
]

def get_point(point_value, grade_value):
    # Use POINT when present; otherwise convert the letter grade
    try:
        point = float(str(point_value).strip())
        if np.isfinite(point):
            return point
    except (TypeError, ValueError):
        pass

    grade = str(grade_value).upper().replace(" ", "").replace(".", "")
    return GRADE_POINTS.get(grade)


def student_features(row, slots):
    # Create a small feature vector from course results in S-number order

    points = []
    for slot in slots:
        point = get_point(row.get(f"S{slot}_POINT", ""), row.get(f"S{slot}_GRADE", ""))
        if point is not None:
            points.append(point)

    # A completely empty record is kept in the analysis instead of crashing.
    if not points:
        return {feature: 0.0 for feature in FEATURES}

    values = np.asarray(points, dtype=float)
    count = len(values)
    quarter = max(1, count // 4)
    middle_start = count // 3
    middle_end = max(middle_start + 1, (2 * count) // 3)

    first = float(values[:quarter].mean())
    middle = float(values[middle_start:middle_end].mean())
    last = float(values[-quarter:].mean())
    changes = np.diff(values)

    if count > quarter:
        later_values = values[quarter:]
        early_peak = float(values[:quarter].max() - later_values.max())
    else:
        early_peak = 0.0

    return {
        "mean_grade": float(values.mean()),
        "first_grade": first,
        "middle_grade": middle,
        "last_grade": last,
        "grade_volatility": float(values.std()),
        "change_volatility": float(changes.std()) if len(changes) else 0.0,
        "early_peak": early_peak,
        "fail_rate": float((values < 2.0).mean()),
    }

def profile_scores(centroids):
    # Score each ML cluster against the seven requested behavior types.

    # Standardize centroid columns so the scores are comparable.
    scale = centroids.std(ddof=0).replace(0, 1.0).fillna(1.0)
    z = (centroids - centroids.mean()) / scale
    scores = pd.DataFrame(index=centroids.index, columns=GROUPS, dtype=float)

    for cluster_id, values in z.iterrows():
        mean = values["mean_grade"]
        first = values["first_grade"]
        middle = values["middle_grade"]
        last = values["last_grade"]
        volatility = values["grade_volatility"]
        change_volatility = values["change_volatility"]

        scores.loc[cluster_id] = [
            # High, stable results.
            mean - volatility - change_volatility - abs(last - first),
            # Weak start and clear improvement by the end.
            (last - first) + last - first,
            # Strong start followed by a decline.
            (first - last) - (last - first),
            # Low overall results with many low grades.
            -mean - 0.75 * first - 0.75 * last + values["fail_rate"],
            # Good at both ends but weak in the middle.
            min(first, last) - middle,
            # A high early peak that is not maintained.
            values["early_peak"] + first - last,
            # Large swings from one course to the next.
            volatility + change_volatility,
        ]

    return scores


def name_clusters(centroids):
    """Assign each of seven K-Means clusters to one unique requested group."""

    scores = profile_scores(centroids)
    cluster_ids = list(centroids.index)
    best_assignment = max(
        permutations(cluster_ids),
        key=lambda assignment: sum(
            scores.loc[assignment[index], GROUPS[index]] for index in range(len(GROUPS))
        ),
    )
    return {
        cluster_id: GROUPS[index] for index, cluster_id in enumerate(best_assignment)
    }


def main():
    input_path = Path("clean.csv")
    output_path = Path("dna.csv")

    data = pd.read_csv(input_path, dtype=str, keep_default_na=False)
    point_slots = set()
    grade_slots = set()
    for column in data.columns:
        point_match = re.fullmatch(r"S(\d+)_POINT", str(column).upper())
        grade_match = re.fullmatch(r"S(\d+)_GRADE", str(column).upper())
        if point_match:
            point_slots.add(int(point_match.group(1)))
        if grade_match:
            grade_slots.add(int(grade_match.group(1)))
    slots = sorted(point_slots | grade_slots)
    if not slots:
        raise ValueError("No S1_POINT/S1_GRADE style course columns were found.")

    feature_table = pd.DataFrame(
        [student_features(row, slots) for _, row in data.iterrows()],
        columns=FEATURES,
    )
    scaled_features = StandardScaler().fit_transform(feature_table[FEATURES])
    model = KMeans(n_clusters=7, n_init=20, random_state=42)
    cluster_ids = model.fit_predict(scaled_features)

    centroids = feature_table.assign(cluster=cluster_ids).groupby("cluster")[FEATURES].mean()
    cluster_names = name_clusters(centroids)
    labels = [cluster_names[cluster_id] for cluster_id in cluster_ids]

    result = data.copy()
    if "DNA_GROUP" in result.columns:
        result = result.drop(columns=["DNA_GROUP"])
    result.insert(0, "DNA_GROUP", labels)
    result.to_csv(output_path, index=False)
    print(f"Created {output_path}")


if __name__ == "__main__":
    main()
