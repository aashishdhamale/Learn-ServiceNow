# ATF setup: Script Lab - VIP caller alert

Layer 3 of **Check my work** runs an ATF test suite in your PDI through the CI/CD API. The app
never writes into your instance, so you create the suite once yourself. It takes about five
minutes.

The graded suite is **server-side only**, so it does not need a client test runner.

## 1. Make sure ATF can run tests

1. In your PDI, open **Automated Test Framework > Administration > Properties**.
2. Set **Enable test/test suite execution** to **Yes** and save.
   (This is the `sn_atf.runner.enabled` system property. The app's connection health check
   reads it and warns you when it's off.)

## 2. Create the test

1. Make sure your application picker shows **Global**.
2. Open **Automated Test Framework > Tests** and click **New**.
3. Name: `VIP caller alert - server contract`. Save.
4. In **Test Steps**, click **Add Test Step**, choose **Server > Run Server Side Script**, and
   click **Next**.
5. Copy everything between `----- START -----` and `----- END -----` from the script below
   into the step's script, **inside** the function body your release generates. Keep the
   wrapper as it is.
6. Submit the step.

The script creates its own test users (ATF rolls them back after each run) and calls
`VipCallerAjax.getVipInfo` the way GlideAjax does. It checks every case in the contract:
a VIP with a manager, a VIP without one, a non-VIP, an unknown sys_id, and an empty value.

## 3. Create the suite

1. Open **Automated Test Framework > Suites** and click **New**.
2. Name it exactly: `Script Lab - VIP caller alert` (the app looks it up by this name).
3. Save, then add the test from step 2 in the **Test Suite Tests** related list.

## 4. Try it

Click **Run Test Suite** on the suite. Before you've built the solution it should fail; that's
expected. Once it passes in your PDI, **Check my work** will pass layer 3 too.

## Optional: see it on the form (not graded)

ATF UI steps need a **client test runner**: a browser tab with
**Automated Test Framework > Run > Client Test Runner** open, signed in as the same user.
To check the experience by hand instead:

1. Mark a test user as **VIP** and give them a **Manager**.
2. Impersonate an agent with only the `itil` role, open a new Incident, and pick that user as
   Caller. You should see the field message with the manager's name.
3. Pick a non-VIP caller, then clear the field. The message should disappear.
4. Repeat in **Service Operations Workspace** if it's installed on your PDI.

If a non-admin agent gets no message, check whether the Script Include is blocked for their
roles. Recent releases add access controls for client-callable Script Includes.

## Troubleshooting

| What you see in layer 3                        | What to do                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| _Test suite not found_                         | The suite name must match exactly: `Script Lab - VIP caller alert`. |
| _ATF test execution is disabled_               | Redo step 1.                                                        |
| _Missing role for the CI/CD API_               | Your user needs `admin` or `sn_cicd.sys_ci_automation`.             |
| Test fails with `VipCallerAjax is not defined` | The Script Include is missing, inactive, or not in Global.          |
