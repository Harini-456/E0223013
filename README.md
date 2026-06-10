# Vehicle Scheduling Output

This folder is intended for scheduler output, priority inbox output, and screenshots.

Right now it only contains this README because actual API run output files were not generated yet.
Once you run the scripts with a valid `AUTH_TOKEN`, you can save the results here as:
- `scheduler_output.txt`
- `priority_output.txt`
- or screenshots such as `scheduler_output.png`

To generate the scheduler output:

```bash
cd C:\Users\harin\OneDrive\Documents\E0223013
npm install
AUTH_TOKEN=your_token node vehicle_maintence_scheduler/app.js
```

To generate the notification priority output:

```bash
AUTH_TOKEN=your_token TOP_N=10 node notification_app_be/priority_inbox.js
```

If the API is protected, set `AUTH_TOKEN` to the value provided by the assignment.
