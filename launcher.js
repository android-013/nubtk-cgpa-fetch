const { spawn } = require('child_process');

const total = 30;
const batchSize = 10;

const batches = Array.from({ length: Math.ceil(total / batchSize) }, (_, i) => ({
    start: i * batchSize + 1,
    end: Math.min((i + 1) * batchSize, total),
}));

(async () => {
    for (const batch of batches) {
        console.log(`🚀 Starting batch: ${batch.start}–${batch.end}`);

        await new Promise((resolve, reject) => {
            const proc = spawn('node', ['batchRunner.js', batch.start, batch.end], { stdio: 'inherit' });

            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Batch ${batch.start}–${batch.end} failed`));
            });
        });
    }

    console.log("✅ All batches complete.");
})();
