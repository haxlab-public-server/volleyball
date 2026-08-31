/*
 * Builds the "online + new/returning joins" chart used in analytics
 * embeds (discordBot.js's daily report, discordCommands.js's /analytics),
 * via a QuickChart (https://quickchart.io) URL — no local rendering, no
 * native dependencies. Node-only; not part of the browser bundle.
 *
 * Returns a PNG Buffer (not a URL), because Discord rejects
 * embed.image.url longer than 2048 characters.
 */

const https = require('node:https');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const WEEKLY_BUCKET_THRESHOLD_DAYS = 9;

function resolveBucketPlan({ period, fromDayKey, toDayKey, timeFormat }) {
    const { dayKeyToLocalMidnightTs } = timeFormat;

    if (period === 'today') {
        const dayStart = dayKeyToLocalMidnightTs(fromDayKey);
        return { bucketMs: HOUR_MS, fromTs: dayStart, toTs: dayStart + DAY_MS, unit: 'hour' };
    }

    const fromTs = dayKeyToLocalMidnightTs(fromDayKey);
    const toTs = dayKeyToLocalMidnightTs(toDayKey) + DAY_MS;
    const spanDays = Math.round((toTs - fromTs) / DAY_MS);

    if (period === 'week' || (period === 'custom' && spanDays <= WEEKLY_BUCKET_THRESHOLD_DAYS)) {
        return { bucketMs: DAY_MS, fromTs, toTs, unit: 'day' };
    }

    return { bucketMs: WEEK_MS, fromTs, toTs, unit: 'week' };
}

function formatBucketLabel(bucketStart, unit, timeFormat) {
    if (unit === 'hour') {
        return timeFormat.getHour(bucketStart).toString().padStart(2, '0') + ':00';
    }
    if (unit === 'day') {
        return timeFormat.getDayKey(bucketStart).slice(5); // "MM-DD"
    }
    return timeFormat.getDayKey(bucketStart).slice(5);
}

function buildAnalyticsChartUrl({ series, unit, timeFormat, roomCategoryLabel }) {
    const labels = series.map(point => formatBucketLabel(point.bucketStart, unit, timeFormat));
    const newVals = series.map(point => point.newCount);
    const returningVals = series.map(point => point.returningCount);
    const onlineVals = series.map(point => point.onlinePeak);

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'New',
                    data: newVals,
                    backgroundColor: '#57F287',
                    yAxisID: 'yBars',
                    stack: 'joins'
                },
                {
                    type: 'bar',
                    label: 'Returning',
                    data: returningVals,
                    backgroundColor: '#5865F2',
                    yAxisID: 'yBars',
                    stack: 'joins'
                },
                {
                    type: 'line',
                    label: 'Online (peak)',
                    data: onlineVals,
                    borderColor: '#FEE75C',
                    backgroundColor: '#FEE75C',
                    yAxisID: 'yOnline',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2
                }
            ]
        },
        options: {
            title: {
                display: true,
                text: `Online & joins — ${roomCategoryLabel}`,
                fontColor: '#e3e5e8'
            },
            legend: {
                labels: { fontColor: '#e3e5e8' }
            },
            scales: {
                xAxes: [{
                    stacked: true,
                    ticks: { fontColor: '#b5bac1' },
                    gridLines: { color: 'rgba(255,255,255,0.08)' }
                }],
                yAxes: [
                    {
                        id: 'yBars',
                        stacked: true,
                        position: 'left',
                        ticks: { beginAtZero: true, fontColor: '#b5bac1' },
                        gridLines: { color: 'rgba(255,255,255,0.08)' },
                        scaleLabel: { display: true, labelString: 'Joins', fontColor: '#b5bac1' }
                    },
                    {
                        id: 'yOnline',
                        position: 'right',
                        ticks: { beginAtZero: true, fontColor: '#b5bac1' },
                        gridLines: { drawOnChartArea: false },
                        scaleLabel: { display: true, labelString: 'Online', fontColor: '#b5bac1' }
                    }
                ]
            }
        }
    };

    const json = JSON.stringify(config);
    return `https://quickchart.io/chart?c=${encodeURIComponent(json)}&backgroundColor=%232b2d31&width=760&height=320&version=2`;
}

function fetchChartBuffer(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`QuickChart responded ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('QuickChart request timed out'));
        });
    });
}

async function buildAnalyticsChart({ db, period, fromDayKey, toDayKey, roomCategory, roomCategoryLabel, timeFormat }) {
    const plan = resolveBucketPlan({ period, fromDayKey, toDayKey, timeFormat });
    const series = db.analyticsGetSeries(plan.fromTs, plan.toTs, roomCategory, plan.bucketMs, timeFormat.getDayKey);

    if (!series || series.length === 0) return null;

    const url = buildAnalyticsChartUrl({
        series,
        unit: plan.unit,
        timeFormat,
        roomCategoryLabel
    });

    try {
        return await fetchChartBuffer(url);
    } catch (err) {
        console.error('[analyticsChart] Failed to fetch chart image:', err);
        return null;
    }
}

module.exports = {
    resolveBucketPlan,
    buildAnalyticsChartUrl,
    buildAnalyticsChart
};