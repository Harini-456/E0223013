// Simple script: fetch notifications, score them, and print the top N.
const axios = require('axios');

const NOTIFICATION_API = 'http://4.224.186.213/evaluation-service/notifications';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const LIMIT = Number(process.env.TOP_N || 10);

// Importance weights: Placement is most important, then Result, then Event
const typeWeight = {
  Placement: 100,
  Result: 60,
  Event: 30,
};

// Score a notification: type weight is primary, timestamp (recency) is secondary
function scoreNotification(notification) {
  const weight = typeWeight[notification.Type] || 10;
  const timestamp = Date.parse(notification.Timestamp);
  return weight * 1_000_000_000 + Math.floor(timestamp / 1000);
}

// Keep the top-k items in a small buffer (min-first). This avoids sorting the whole list.
function topKNotifications(notifications, k) {
  const result = [];

  for (const notification of notifications) {
    const score = scoreNotification(notification);
    if (result.length < k) {
      result.push({ notification, score });
      if (result.length === k) {
        result.sort((a, b) => a.score - b.score);
      }
      continue;
    }

    if (score <= result[0].score) {
      continue;
    }

    result[0] = { notification, score };
    result.sort((a, b) => a.score - b.score);
  }

  return result
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.notification);
}

// Get notifications from the API
async function fetchNotifications() {
  const response = await axios.get(NOTIFICATION_API, {
    headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {},
    timeout: 10000,
  });
  return response.data.notifications || [];
}

// Run the script: fetch, pick top, and print them
async function main() {
  try {
    const notifications = await fetchNotifications();
    const topNotifications = topKNotifications(notifications, LIMIT);

    console.log(`Top ${LIMIT} priority notifications:`);
    topNotifications.forEach((notification, index) => {
      console.log(`${index + 1}. [${notification.Type}] ${notification.Message} (${notification.Timestamp})`);
    });
  } catch (error) {
    console.error('Failed to fetch or process notifications:', error.message || error);
    process.exit(1);
  }
}

main();
