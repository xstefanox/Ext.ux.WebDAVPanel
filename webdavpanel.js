

Ext.define('Ext.ux.WebDAV.Resource', {
    extend: 'Ext.data.Model',
    idProperty: 'url',
    fields: [
        {name: 'text',     type: 'string'},
        {name: 'url',      type: 'string'},
        {name: 'ctime',    type: 'date'},
        {name: 'mtime',    type: 'date'},
        {name: 'mimeType', type: 'string'},
        {name: 'size',     type: 'int'},
        {name: 'etag',     type: 'string'}
    ],
    statics: {
        
        fromCarcassResource: function(resource, tree) {
            
            if (!(resource instanceof Carcass.Resource)) {
                
                throw new TypeError('Carcass.Resource needed');
            }
            
            // copy the listed properties from the resource to the record
            var record = Ext.create('Ext.ux.WebDAV.Resource',
                Ext.copyTo({
                    url: resource.href,
                    text: (resource.parent === null && resource instanceof Carcass.Collection) ? '/' : resource.href.replace(/\/$/, '').split('/').pop(),
                    leaf: !(resource instanceof Carcass.Collection)
                },
                resource,
                [ 'ctime', 'mtime', 'mimeType', 'size', 'etag' ])
            );
            
            // save a reference to the tree
            record.tree = tree;
            
            // mark the node as loaded
            record.set('loaded', true);
            
            return record;
        }
    }
});


Ext.define('Ext.ux.WebDAV.NodeInterface', {
    extend: 'Ext.data.NodeInterface',
    statics: {
        
        decorate: function(node) {

            // override the isExpandable() method to count only leaf nodes
            var expandableOrig = node.isExpandable;

            node.isExpandable = function() {

                var expandable = false;

                this.childNodes.forEach(function(node) {

                    if (!node.isLeaf()) {

                        expandable = true;
                    }
                });

                return expandableOrig.call(this) && expandable;
            };
            
            // override the isLast() method to count only non-leaf nodes
            node.isLast = function() {

                var isLast = true;

                var walkNextSiblings = function(node) {

                    // if the node has a right sibling
                    if (node.nextSibling) {

                        if (!node.nextSibling.isLeaf()) {

                            isLast = false;
                        }
                        else {

                            walkNextSiblings(node.nextSibling);
                        }
                    }
                };

                walkNextSiblings(this);

                return isLast;
            };
        }
    }
});


Ext.define('Ext.ux.WebDAV.Panel', {
    extend: 'Ext.panel.Panel',
    xtype: 'webdavpanel',
    layout: 'border',
    loadList: false,
    constructor: function() {
        
        this.callParent(arguments);
        
        // @TODO: uncomment
        // disable the context menu on the panel
//        this.on('render', function() {
//            this.getVisibilityEl().on('contextmenu', Ext.emptyFn, null, { preventDefault: true });
//        }, this, { single: true });
        
        // create the treepanel
        this.add({
            // @TODO: remove this property
            id: 'test',
            xtype: 'treepanel',
            region: 'west',
            // enable resizing of the panel
            split: true,
            animate: false,
            width: 300,
            // save a reference to the parent
            webdav: this,
            store: {
                xtype: 'treestore',
                model: 'Ext.ux.WebDAV.Resource',
                // temporary root, will be removed on propfind
                root: { text: '/' }
            },
            selModel: {

                listeners: {

                    selectionChange: function(model, nodes) {

                        // select the first node because because only one node can be selected
                        var node = nodes[0];
                        
                        // get a reference to the grid
                        var grid = this.view.getTreeStore().tree.getRootNode().tree.ownerCt.child('gridpanel');
                        
                        // get a reference to the grid panel store
                        var store = grid.getStore();

                        // clear the store
                        store.removeAll();
                        
                        if (node.isLeaf()) {
                            grid.disable();
                        }
                        else {
                            grid.enable();
                            
                            // add the children of the selected tree node
                            store.add(node.childNodes);
                        }
                    }
                }
            },
            tbar: [
                {
                    text: 'Reload',
                    handler: function() {

                        this.ownerCt.ownerCt.onReload();
                    }
                }
            ],
            onPropfindSuccess: function(statusText, root, resources) {
                
                // get a reference to the grid
                var grid = this.ownerCt.child('grid');

                // unmask the grid
                grid.el.unmask();
                
                var rootNode = this.store.setRootNode(Ext.ux.WebDAV.Resource.fromCarcassResource(root, this));

                // create a recursive function used to append children to each nodes
                var add = function(resource) {

                    var node = this.appendChild(Ext.ux.WebDAV.Resource.fromCarcassResource(resource, this.tree));

                    Ext.ux.WebDAV.NodeInterface.decorate(node);

                    // if the resource node is a collection
                    if (resource instanceof Carcass.Collection) {

                        // add its resources
                        resource.children.forEach(add, node);
                    }
                };

                // if the root is a collection
                if (root instanceof Carcass.Collection) {
                
                    root.children.forEach(add, rootNode);
                }

                // expand the full tree
                this.expandAll();

                // select the root node
                this.getSelectionModel().select(rootNode);
            },
            onPropfindError: function(statusText) {
                
                // get a reference to the grid
                var grid = this.ownerCt.child('grid');
                
                // show the error message
                grid.el.mask(statusText, 'x-ux-webdav-mask-error');
            },
            onReload: function() {

                var client = new Carcass.Client(this.webdav.hostname, this.webdav.port, this.webdav.protocol);

                client.PROPFIND(this.webdav.path, null, null, function(success, statusText, root, resources) {

                    if (success) {
                        this.onPropfindSuccess(statusText, root, resources);
                    }
                    else {
                        this.onPropfindError(statusText);
                    }
                }, this);
            },
            listeners: {

                render: function() {

                    this.onReload();
                },
                afteritemexpand: function(expandedNode) {

                    var view = this.getView();

                    var hideLeaves = function(expandedNode) {

                        expandedNode.childNodes.forEach(function(node) {

                            if (node.isLeaf()) {

                                var el = Ext.fly(view.getNodeByRecord(node));

                                if (el) {
                                    el.setDisplayed(false);
                                }
                            }
                            else {

                                hideLeaves(node);
                            }
                        }, this);
                    };

                    hideLeaves(expandedNode);
                }
            }
        });
        
        this.add({
            xtype: 'gridpanel',
            region: 'center',
            forceFit: true,
            tbar: [
                { text: 'Upload' }
            ],
            store: {
                model: 'Ext.ux.WebDAV.Resource'
            },
            columns: [
                {
                    header: 'Name',
                    dataIndex: 'text',
                    width: 55,
                    renderer: function(value, metadata, record) {

                        metadata.tdCls = Ext.baseCSSPrefix + 'ux-webdav-grid-icon ' + Ext.baseCSSPrefix + 'ux-webdav-grid-icon-';

                        if (record.isLeaf()) {
                            metadata.tdCls += 'resource ' + record.get('mimeType').replace(/[./]+/, '_');
                        }
                        else {
                            metadata.tdCls += 'collection';
                        }

                        return value;
                    }
                },
                {
                    header: 'Type',
                    dataIndex: 'mimeType',
                    width: 15,
                    renderer: function(value, metadata, record) {

                        if (record.isLeaf()) {
                            return value;
                        }
                        else {
                            return '--';
                        }
                    }
                },
                {
                    header: 'Last modification',
                    dataIndex: 'mtime',
                    width: 15,
                    xtype: 'datecolumn',
                    format: this.dateFormat
                },
                {
                    header: 'Size',
                    dataIndex: 'size',
                    width: 15,
                    renderer: function(value, metadata, record) {

                        if (record.isLeaf()) {
                            return Ext.util.Format.fileSize(value);
                        }
                        else {
                            return '--';
                        }
                    }
                }
            ],
            listeners: {
                    itemdblclick: function(view, record, item, index, event, options) {
                        
                        // if the double-clicked item is a collection
                        if (!record.isLeaf()) {
                            
                            // select the corresponding node in the tree
                            view.ownerCt.ownerCt.child('treepanel').getSelectionModel().select(record);
                        }
                    }
            }
        });
    }
});
