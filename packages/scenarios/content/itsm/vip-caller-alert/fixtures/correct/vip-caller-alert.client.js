function onChange(control, oldValue, newValue, isLoading, isTemplate) {
    if (isLoading) {
        return;
    }
    g_form.hideFieldMsg('caller_id', true);
    if (!newValue) {
        return;
    }

    var ga = new GlideAjax('VipCallerAjax');
    ga.addParam('sysparm_name', 'getVipInfo');
    ga.addParam('sysparm_caller_id', newValue);
    ga.getXMLAnswer(function (answer) {
        var info;
        try {
            info = JSON.parse(answer);
        } catch (e) {
            return;
        }
        // Ignore a late answer if the agent has already picked someone else.
        if (!info.vip || g_form.getValue('caller_id') !== newValue) {
            return;
        }
        var message = info.managerName
            ? 'VIP caller. Manager: ' + info.managerName
            : 'VIP caller. No manager on record.';
        g_form.showFieldMsg('caller_id', message, 'info');
    });
}
