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
const MONTH_MS = 30 * DAY_MS;

const INTERVALS = {
    '1h':  { bucketMs: HOUR_MS, unit: 'hour' },
    '3h':  { bucketMs: 3 * HOUR_MS, unit: 'hour' },
    '6h':  { bucketMs: 6 * HOUR_MS, unit: 'hour' },
    '12h': { bucketMs: 12 * HOUR_MS, unit: 'hour' },
    '1d':  { bucketMs: DAY_MS, unit: 'day' },
    '3d':  { bucketMs: 3 * DAY_MS, unit: 'day' },
    '1w':  { bucketMs: WEEK_MS, unit: 'week' },
    '1m':  { bucketMs: MONTH_MS, unit: 'month' }
};

const INTERVAL_CHOICES = Object.keys(INTERVALS);

function resolveRangeTs(fromDayKey, toDayKey, timeFormat) {
    const { dayKeyToLocalMidnightTs } = timeFormat;
    const fromTs = dayKeyToLocalMidnightTs(fromDayKey);
    const toTs = dayKeyToLocalMidnightTs(toDayKey) + DAY_MS;
    return { fromTs, toTs };
}

function autoInterval(spanDays) {
    if (spanDays <= 1) return '1h';
    if (spanDays <= 3) return '3h';
    if (spanDays <= 9) return '1d';
    if (spanDays <= 45) return '1w';
    return '1m';
}

function resolveBucketPlan({ period, fromDayKey, toDayKey, timeFormat, interval }) {
    const { fromTs, toTs } = resolveRangeTs(fromDayKey, toDayKey, timeFormat);
    const spanDays = Math.max(1, Math.round((toTs - fromTs) / DAY_MS));

    let key = interval;
    if (!key || !INTERVALS[key]) {
        if (period === 'today') {
            key = '1h';
        } else {
            key = autoInterval(spanDays);
        }
    }

    const { bucketMs, unit } = INTERVALS[key];
    return { bucketMs, fromTs, toTs, unit, interval: key };
}

function formatBucketLabel(bucketStart, unit, timeFormat) {
    if (unit === 'hour') {
        const hour = timeFormat.getHour(bucketStart).toString().padStart(2, '0');
        return `${hour}:00`;
    }
    if (unit === 'day' || unit === 'week' || unit === 'month') {
        return timeFormat.getDayKey(bucketStart).slice(5); // "MM-DD"
    }
    return timeFormat.getDayKey(bucketStart).slice(5);
}

function buildAnalyticsChartUrl({ series, unit, timeFormat, roomCategoryLabel, onlineMax, fromDayKey, toDayKey, interval }) {
    const labels = series.map(point => formatBucketLabel(point.bucketStart, unit, timeFormat));
    const newVals = series.map(point => (point.newCount > 0 ? point.newCount : null));
    const returningVals = series.map(point => (point.returningCount > 0 ? point.returningCount : null));
    const onlineVals = series.map(point => point.onlinePeak);
    const maxOnline = Math.max(0, ...onlineVals);
    const maxJoins = Math.max(
        0,
        ...series.map(point => (point.newCount || 0) + (point.returningCount || 0))
    );
    const joinsSuggestedMax = maxJoins === 0 ? 5 : Math.ceil(maxJoins * 2.2);
    const onlineAxisMax = (Number.isFinite(onlineMax) && onlineMax > 0)
        ? onlineMax
        : (maxOnline === 0 ? 5 : Math.ceil(maxOnline * 1.25));

    const yOnlineScale = (Number.isFinite(onlineMax) && onlineMax > 0)
        ? {
            position: 'right',
            min: 0,
            max: onlineAxisMax,
            ticks: {
                beginAtZero: true,
                stepSize: onlineAxisMax <= 20 ? 1 : undefined,
                color: '#b5bac1'
            },
            grid: { drawOnChartArea: false },
            title: {
                display: true,
                text: 'Online',
                color: '#b5bac1'
            }
        }
        : {
            position: 'right',
            suggestedMax: onlineAxisMax,
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
        };

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'New',
                    data: newVals,
                    backgroundColor: 'rgba(87, 242, 135, 0.28)',
                    borderColor: 'rgba(87, 242, 135, 0.45)',
                    borderWidth: 0,
                    yAxisID: 'yBars',
                    stack: 'joins',
                    barPercentage: 0.7,
                    categoryPercentage: 0.85,
                    order: 2,
                    datalabels: {
                        display: false,
                        anchor: 'center',
                        align: 'center',
                        textAlign: 'center',
                        offset: 0,
                        clamp: true,
                        color: '#9ae6b4',
                        font: { weight: 'bold', size: 8 },
                        formatter: 'function(value) { return value; }'
                    }
                },
                {
                    type: 'bar',
                    label: 'Returning',
                    data: returningVals,
                    backgroundColor: 'rgba(88, 101, 242, 0.28)',
                    borderColor: 'rgba(88, 101, 242, 0.45)',
                    borderWidth: 0,
                    yAxisID: 'yBars',
                    stack: 'joins',
                    barPercentage: 0.7,
                    categoryPercentage: 0.85,
                    order: 2,
                    datalabels: {
                        display: false,
                        anchor: 'center',
                        align: 'center',
                        textAlign: 'center',
                        offset: 0,
                        clamp: true,
                        color: '#a5b4fc',
                        font: { weight: 'bold', size: 8 },
                        formatter: 'function(value) { return value; }'
                    }
                },
                {
                    type: 'line',
                    label: 'Online (peak)',
                    data: onlineVals,
                    borderColor: '#FEE75C',
                    backgroundColor: 'rgba(254, 231, 92, 0.12)',
                    yAxisID: 'yOnline',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#FEE75C',
                    pointBorderColor: 'transparent',
                    pointBorderWidth: 1.5,
                    borderWidth: 2.5,
                    order: 1,
                    datalabels: {
                        display: false,
                        align: 'top',
                        anchor: 'end',
                        offset: 4,
                        clamp: true,
                        color: '#FEE75C',
                        font: { weight: 'bold', size: 9 },
                        formatter: 'function(value) { return value > 0 ? value : null; }'
                    }
                }
            ]
        },
        options: {
            layout: {
                padding: { top: 12, right: 4, bottom: 0, left: 0 }
            },
            plugins: {
                title: {
                    display: true,
                    text: (() => {
                        const rangeLabel = fromDayKey && toDayKey
                            ? (fromDayKey === toDayKey ? fromDayKey : `${fromDayKey} — ${toDayKey}`)
                            : null;
                        const intervalLabel = interval ? ` · ${interval}` : '';
                        if (rangeLabel) {
                            return `Online & joins — ${roomCategoryLabel}  (${rangeLabel}${intervalLabel})`;
                        }
                        return `Online & joins — ${roomCategoryLabel}`;
                    })(),
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
                    ticks: {
                        color: '#b5bac1',
                        autoSkip: true,
                        maxTicksLimit: 24
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                },
                yBars: {
                    stacked: true,
                    position: 'left',
                    suggestedMax: joinsSuggestedMax,
                    ticks: {
                        beginAtZero: true,
                        color: '#b5bac1'
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    title: {
                        display: true,
                        text: 'Joins',
                        color: '#b5bac1'
                    }
                },
                yOnline: yOnlineScale
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

async function buildAnalyticsChart({
    db,
    period,
    fromDayKey,
    toDayKey,
    roomCategory,
    roomCategoryLabel,
    timeFormat,
    interval,
    onlineMax
}) {
    const plan = resolveBucketPlan({ period, fromDayKey, toDayKey, timeFormat, interval });
    const series = db.analyticsGetSeries(plan.fromTs, plan.toTs, roomCategory, plan.bucketMs, timeFormat.getDayKey);

    if (!series || series.length === 0) return null;

    const url = buildAnalyticsChartUrl({
        series,
        unit: plan.unit,
        timeFormat,
        roomCategoryLabel,
        onlineMax,
        fromDayKey,
        toDayKey,
        interval: plan.interval
    });

    try {
        return await fetchChartBuffer(url);
    } catch (err) {
        console.error('[analyticsChart] Failed to fetch chart image:', err);
        return null;
    }
}

module.exports = {
    INTERVALS,
    INTERVAL_CHOICES,
    resolveBucketPlan,
    buildAnalyticsChartUrl,
    buildAnalyticsChart
};