# Vehicle Maintenance Scheduler

This microservice fetches depot capacity and vehicle maintenance tasks from the provided Affordmed APIs and computes an optimal selection of tasks that maximizes total impact while keeping total mechanic hours within budget.

## Run

1. Install dependencies in the root folder if not already installed:
   ```bash
   npm install axios
   ```
2. Start the service:
   ```bash
   AUTH_TOKEN=your_token node vehicle_maintence_scheduler/app.js
   ```

## Endpoints

- `GET /` - service overview
- `GET /depots` - fetch depot list
- `GET /vehicles` - fetch vehicles/tasks list
- `GET /schedule?depotId=1` - compute best task selection for depot 1
- `GET /schedule?dailyHours=100` - compute best task selection for a custom budget

## Algorithm

Uses a 0/1 knapsack dynamic programming strategy optimized by daily mechanic-hours capacity.
