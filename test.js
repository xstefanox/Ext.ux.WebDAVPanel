
Ext.application({
    name: 'MyApp',
    launch: function() {

        Ext.create('Ext.container.Viewport', {
            layout: 'fit',
            items: {
                xtype: 'webdavpanel',
                title: 'WebDAV shared files',
                loadList: true,
                path: location.pathname.replace(/[^/]*$/, ''),
                hostname: 'localhost',
                port: 80,
                dateFormat: 'd M Y'
            }
        });
        
    }
});

