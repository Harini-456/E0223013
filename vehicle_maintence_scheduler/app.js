// Simple vehicle maintenance scheduler
// Fetches depot and vehicle task info from the evaluation API and
// picks a set of tasks that gives the most impact within the available
// mechanic-hours using a 0/1 knapsack DP.
const http = require('http');
const url = require('url');
const axios = require('axios');

const API_BASE = 'http://4.224.186.213/evaluation-service';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const PORT = process.env.PORT || 4100;

// Get depots from the remote API.
// Returns an array like [{ ID, MechanicHours }, ...]
async function fetchDepots() {
  const response = await axios.get(`${API_BASE}/depots`, {
    headers: AUTH_TOKEN
      ? { Authorization: `Bearer ${AUTH_TOKEN}` }
      : {},
    timeout: 10000,
  });
  return response.data.depots || [];
}

// Get vehicles (maintenance tasks) from the API.
// Each item usually contains TaskID, Duration and Impact.
async function fetchVehicles() {
  const response = await axios.get(`${API_BASE}/vehicles`, {
    headers: AUTH_TOKEN
      ? { Authorization: `Bearer ${AUTH_TOKEN}` }
      : {},
    timeout: 10000,
  });
  return response.data.vehicles || [];
}

// Turn raw vehicle records into the `task` shape we use below:
// { id, duration, impact }
function normalizeTasks(vehicles) {
  return vehicles
    .filter((item) => item.Duration != null && item.Impact != null)
    .map((item, index) => ({
      id: item.TaskID || `task-${index}`,
      duration: Number(item.Duration),
      impact: Number(item.Impact),
    }))
    .filter((item) => item.duration > 0 && item.impact >= 0);
}

// 0/1 knapsack DP. Tasks are indivisible.
// Input: tasks array and capacity (hours).
// Output: chosen task IDs, total impact, and total duration.
function knapsack(tasks, capacity) {
  const n = tasks.length;
  const dp = Array.from({ length: capacity + 1 }, () => 0);
  const take = Array.from({ length: capacity + 1 }, () => []);

  for (let i = 0; i < n; i++) {
    const { id, duration, impact } = tasks[i];
    for (let w = capacity; w >= duration; w--) {
      const candidate = dp[w - duration] + impact;
      if (candidate > dp[w]) {
        dp[w] = candidate;
        take[w] = take[w - duration].concat(id);
      }
    }
  }

  const totalImpact = dp[capacity];
  const selectedTaskIds = take[capacity];
  const totalDuration = selectedTaskIds.reduce((sum, id) => {
    const task = tasks.find((t) => t.id === id);
    return sum + (task ? task.duration : 0);
  }, 0);

  return {
    selectedTaskIds,
    totalImpact,
    totalDuration,
  };
}

// Small helper to send JSON responses with CORS header.
function toJsonResponse(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

// Handle incoming HTTP requests and route to simple endpoints.
async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;

  try {
    if (pathname === '/depots') {
      const depots = await fetchDepots();
      return toJsonResponse(res, 200, { depots });
    }

    if (pathname === '/vehicles') {
      const vehicles = await fetchVehicles();
      return toJsonResponse(res, 200, { vehicles });
    }

    if (pathname === '/schedule') {
      const depotId = Number(query.depotId || 0);
      const dailyHours = query.dailyHours ? Number(query.dailyHours) : undefined;
      const depots = await fetchDepots();
      const depot = depotId ? depots.find((d) => d.ID === depotId) : depots[0];

      if (!depot && dailyHours == null) {
        return toJsonResponse(res, 400, {
          error:
            'Depot not found. Provide depotId or dailyHours query parameter.',
        });
      }

      const capacity = dailyHours != null ? dailyHours : depot.MechanicHours;
      const vehicles = await fetchVehicles();
      const tasks = normalizeTasks(vehicles);
      const schedule = knapsack(tasks, capacity);

      return toJsonResponse(res, 200, {
        depotId: depot ? depot.ID : null,
        capacity,
        selectedTasks: schedule.selectedTaskIds,
        totalImpact: schedule.totalImpact,
        totalDuration: schedule.totalDuration,
        taskCount: schedule.selectedTaskIds.length,
      });
    }

    if (pathname === '/') {
      return toJsonResponse(res, 200, {
        message: 'Vehicle Maintenance Scheduler Microservice',
        endpoints: [
          '/depots',
          '/vehicles',
          '/schedule?depotId=1',
          '/schedule?dailyHours=100',
        ],
      });
    }

    return toJsonResponse(res, 404, { error: 'Endpoint not found' });
  } catch (error) {
    const message = error.response
      ? error.response.data || error.response.statusText
      : error.message;
    return toJsonResponse(res, 500, { error: 'Request failed', message });
  }
}

// Start the HTTP server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`Vehicle Maintenance Scheduler running at http://localhost:${PORT}`);
  console.log('Use AUTH_TOKEN in env for protected API access if required.');
});
