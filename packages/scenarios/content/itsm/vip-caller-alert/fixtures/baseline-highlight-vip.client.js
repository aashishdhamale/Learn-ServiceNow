// Stand-in for an out-of-box onChange script on incident.caller_id (not the learner's work).
// The grader must not mistake it for the learner's solution.
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading || newValue === '') {
        return;
    }
    g_form.getReference('caller_id', function (caller) {
        if (caller.vip === 'true') {
            g_form.addDecoration('caller_id', 'icon-star', 'VIP');
        }
    });
}
