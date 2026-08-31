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

    const maxOnline = Math.max(0, ...onlineVals);
    const maxJoins = Math.max(0, ...newVals.map((v, i) => v + (returningVals[i] || 0)));
    const onlineSuggestedMax = maxOnline === 0 ? 5 : Math.ceil(maxOnline * 1.25);
    const joinsSuggestedMax = maxJoins === 0 ? 5 : Math.ceil(maxJoins * 1.7);

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'New',
                    data: newVals,
                    backgroundColor: 'rgba(87, 242, 135, 0.55)',
                    borderColor: 'rgba(87, 242, 135, 0.85)',
                    borderWidth: 1,
                    yAxisID: 'yBars',
                    stack: 'joins',
                    barPercentage: 0.55,
                    categoryPercentage: 0.7,
                    order: 1,
                    datalabels: {
                        display: 'function(ctx) { return ctx.dataset.data[ctx.dataIndex] > 0; }',
                        anchor: 'center',
                        align: 'center',
                        color: '#b6f0c8',
                        font: { weight: 'bold', size: 9 },
                        formatter: 'function(value) { return value > 0 ? value : ""; }'
                    }
                },
                {
                    type: 'bar',
                    label: 'Returning',
                    data: returningVals,
                    backgroundColor: 'rgba(88, 101, 242, 0.55)',
                    borderColor: 'rgba(88, 101, 242, 0.85)',
                    borderWidth: 1,
                    yAxisID: 'yBars',
                    stack: 'joins',
                    barPercentage: 0.55,
                    categoryPercentage: 0.7,
                    order: 1,
                    datalabels: {
                        display: 'function(ctx) { return ctx.dataset.data[ctx.dataIndex] > 0; }',
                        anchor: 'center',
                        align: 'center',
                        color: '#b4bcf5',
                        font: { weight: 'bold', size: 9 },
                        formatter: 'function(value) { return value > 0 ? value : ""; }'
                    }
                },
                {
                    type: 'line',
                    label: 'Online (peak)',
                    data: onlineVals,
                    borderColor: '#FEE75C',
                    backgroundColor: 'rgba(254, 231, 92, 0.15)',
                    yAxisID: 'yOnline',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                    order: 2,
                    datalabels: {
                        display: false
                    }
                }
            ]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Online & joins — ${roomCategoryLabel}`,
                    color: '#e3e5e8'
                },
                legend: {
                    labels: { color: '#e3e5e8' }
                },
                datalabels: {
                    display: true
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: '#b5bac1' },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                },
                yBars: {
                    stacked: true,
                    position: 'left',
                    suggestedMax: joinsSuggestedMax,
                    ticks: {
                        beginAtZero: true,
                        color: '#b5bac1'
                    },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    title: {
                        display: true,
                        text: 'Joins',
                        color: '#b5bac1'
                    }
                },
                yOnline: {
                    position: 'right',
                    suggestedMax: onlineSuggestedMax,
                    ticks: {
                        beginAtZero: true,
                        color: '#b5bac1'
                    },
                    grid: { drawOnChartArea: false },
                    title: {
                        display: true,
                        text: 'Online',
                        color: '#b5bac1'
                    }
                }
            }
        }
    };

    const json = JSON.stringify(config);
    return `https://quickchart.io/chart?c=${encodeURIComponent(json)}&backgroundColor=%232b2d31&width=760&height=320&version=3`;
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