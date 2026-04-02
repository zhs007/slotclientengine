### Plan

1.  **Modify `example001.ts` to handle the `WAITTING_PLAYER` state.**
    - I will add a new event listener for the `state` event.
    - Inside the listener, I will check if the new state is `WAITTING_PLAYER`.
    - If it is, I will get the `optionals` from `client.getUserInfo()`.
    - I will then randomly select an index from the `optionals` array.
    - Finally, I will call `client.selectOptional()` with the random index.

2.  **Modify the `spinAcrossLines` function in `example001.ts`.**
    - I will remove the `seenWin` and `seenLose` logic.
    - I will change the loop to run exactly 100 times for each `lines` option.
    - The `attempts` counter will be used to limit the loop to 100 iterations.

3.  **Create a task report.**
    - After completing the code changes, I will create a `jules/plan016-report.md` file to document the process.

4.  **Update `jules.md`.**
    - I will append the relevant details from the task report to `jules.md`.

5.  **Update `agents.md`.**
    - I will review the changes and determine if any updates to `agents.md` are necessary. Given the nature of this task, it's unlikely, but I will still check.
