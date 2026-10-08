function onChange(control, oldValue, newValue, isLoading, isTemplate) {
    if (isLoading || newValue === '') {
        return;
    }

    var ga = new GlideAjax('VipCallerAjax');
    ga.addParam('sysparm_name', 'getVipInfo');
    ga.addParam('sysparm_caller_id', newValue);
    ga.getXMLWait();
    var info = JSON.parse(ga.getAnswer());

    if (info.vip) {
        // Look the manager up straight from the browser.
        var caller = new GlideRecord('sys_user');
        caller.get(newValue);
        var manager = new GlideRecord('sys_user');
        manager.get(caller.manager);
        g_form.showFieldMsg('caller_id', 'VIP caller. Manager: ' + manager.name, 'info');
    }
}
