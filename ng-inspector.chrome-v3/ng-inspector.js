(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var NGI = {
	InspectorAgent: require('./InspectorAgent'),
	Module: require('./Module'),
	TreeView: require('./TreeView'),
	Service: require('./Service')
};

function App(node, modules) {
	var pane = window.ngInspector.pane;
	var app = this;
	var observer = new MutationObserver(function(mutations) {
		setTimeout(function() {
			for (var i = 0; i < mutations.length; i++) {
				var target = mutations[i].target;

				// Avoid responding to mutations in the extension UI
				if (!pane.contains(target)) {
					for (var f = 0; f < mutations[i].addedNodes.length; f++) {
						var addedNode = mutations[i].addedNodes[f];
						if (addedNode.classList && !addedNode.classList.contains('ngi-hl')) {
							NGI.InspectorAgent.inspectNode(app, addedNode);
						}
					}
				}
			}
		}, 4);
	});
	var observerConfig = { childList: true, subtree: true };

	this.startObserver = function() {
		observer.observe(node, observerConfig);
	};

	this.stopObserver = function() {
		observer.disconnect();
	};

	this.node = node;

	this.$injector = window.angular.element(node).data('$injector');
	
	if (!modules) {
		modules = [];
	} else if (typeof modules === typeof '') {
		modules = [modules];
	}

	var probes = [builtInProbe];
	this.registerProbe = function(probe) {
		probes.push(probe);
	};

	this.probe = function(node, scope, isIsolate) {
		for (var i = 0; i < probes.length; i++) {
			probes[i](node, scope, isIsolate);
		}
	};

	// Attempt to retrieve the property of the ngApp directive in the node from
	// one of the possible declarations to retrieve the AngularJS module defined
	// as the main dependency for the app. An anonymous ngApp is a valid use
	// case, so this is optional.
	var attrs = ['ng\\:app', 'ng-app', 'x-ng-app', 'data-ng-app'];
	var main;
	if ('getAttribute' in node) {
		for (var i = 0; i < attrs.length; i++) {
			if (node.hasAttribute(attrs[i])) {
				main = node.getAttribute(attrs[i]);
				break;
			}
		}
		if (main) {
			modules.push(main);
		}
	}

	// Register module dependencies
	for (var m = 0; m < modules.length; m++) {
		NGI.Module.register(this, modules[m]);
	}

	var label = main ? main : nodeRep(node);
	this.view = NGI.TreeView.appItem(label, node);
	window.ngInspector.pane.treeView.appendChild(this.view.element);
}

// This probe is registered by default in all apps, and probes nodes
// for AngularJS built-in directives that are not exposed in the _invokeQueue
// despite the 'ng' module being a default dependency
function builtInProbe(node, scope) {

	if (node === document) {
		node = document.getElementsByTagName('html')[0];
	}

	if (node && node.hasAttribute('ng-repeat')) {
		scope.view.addAnnotation('ngRepeat', NGI.Service.BUILTIN);
	}

	// Label ng-include scopes
	if (node && node.hasAttribute('ng-include')) {
		scope.view.addAnnotation('ngInclude', NGI.Service.BUILTIN);
	}

	// Label ng-if scopes
	if (node && node.hasAttribute('ng-if')) {
		scope.view.addAnnotation('ngIf', NGI.Service.BUILTIN);
	}

	// Label root scopes
	if (scope.ngScope.$root.$id === scope.ngScope.$id) {
		scope.view.addAnnotation('$rootScope', NGI.Service.BUILTIN);
	}

	// Label ng-transclude scopes
	if (node && node.parentNode && node.parentNode.hasAttribute &&
		node.parentNode.hasAttribute('ng-transclude')) {
		scope.view.addAnnotation('ngTransclude', NGI.Service.BUILTIN);
	}
}

var appCache = [];
App.bootstrap = function(node, modules) {
	for (var i = 0; i < appCache.length; i++) {
		if (appCache[i].node === node) {
			return appCache[i];
		}
	}
	var newApp = new App(node, modules);
	if (window.ngInspector.pane.visible) {
		NGI.InspectorAgent.inspectApp(newApp);
		newApp.startObserver();
	}
	appCache.push(newApp);
};

var didFindApps = false;

App.inspectApps = function() {
	if (!didFindApps) {
		NGI.InspectorAgent.findApps(App);
		didFindApps = true;
	}

	for (var i = 0; i < appCache.length; i++) {
		NGI.InspectorAgent.inspectApp(appCache[i]);
		appCache[i].startObserver();
	}
};

App.startObservers = function() {
	for (var i = 0; i < appCache.length; i++) {
		appCache[i].startObserver();
	}

};

App.stopObservers = function() {
	for (var i = 0; i < appCache.length; i++) {
		appCache[i].stopObserver();
	}
};

// Utility function that returns a DOM Node to be injected in the UI,
// displaying a user-friendly CSS selector-like representation of a DOM Node
// in the inspected application
function nodeRep(node) {
	var label = document.createElement('label');

	if (node === document) {
		label.textContent = 'document';
		return label;
	}

	// tag
	label.textContent = node.tagName.toLowerCase();

	// #id
	if (node.hasAttribute('id')) {
		var small = document.createElement('small');
		small.textContent = '#' + node.getAttribute('id');
		label.appendChild(small);
	}

	// .class.list
	var classList = node.className.split(/\s/);
	for (var i = 0; i < classList.length; i++) {
		var small = document.createElement('small');
		small.textContent = '.' + classList[i];
		label.appendChild(small);
	}

	return label;
}

module.exports = App;

},{"./InspectorAgent":4,"./Module":8,"./Service":11,"./TreeView":12}],2:[function(require,module,exports){
function Highlighter() {}

function offsets(node) {
	var vals = {
		x: node.offsetLeft,
		y: node.offsetTop,
		w: node.offsetWidth,
		h: node.offsetHeight
	};
	while (node = node.offsetParent) {
		vals.x += node.offsetLeft;
		vals.y += node.offsetTop;
	}
	return vals;
}

var hls = [];
Highlighter.hl = function(node, label) {
	var box = document.createElement('div');
	box.className = 'ngi-hl ngi-hl-scope';
	if (label) {
		box.textContent = label;
	}
	var pos = offsets(node);
	box.style.left = pos.x + 'px';
	box.style.top = pos.y + 'px';
	box.style.width = pos.w + 'px';
	box.style.height = pos.h + 'px';
	document.body.appendChild(box);
	hls.push(box);
	return box;
};

Highlighter.clear = function() {
	var box;
	while (box = hls.pop()) {
		box.parentNode.removeChild(box);
	}
};

module.exports = Highlighter;

},{}],3:[function(require,module,exports){
var NGI = {
	InspectorPane: require('./InspectorPane'),
	App: require('./App'),
	Scope: require('./Scope')
};

module.exports = function() {

	// Settings defaults
	this.settings = {
		showWarnings: false
	};

	this.pane = new NGI.InspectorPane();

	// The actual toggling is done by the `NGI.InspectorPane`. Since the
	// `ng-inspector.js` script is injected into the page DOM with no direct
	// access to `safari.extension.settings`, settings can only be sent via
	// messages. To save on the number of messages sent back and forth between
	// this injected script and the browser extension, the browser settings are
	// sent along with the toggle command. A side effect is that changes in the
	// settings only take place after a toggle is triggered.
	this.toggle = function(settings) {

		// If angular is not present in the global scope, we stop the process
		if (!('angular' in window)) {
			alert('This page does not include AngularJS');
			return;
		}

		// Passing the settings parameter is optional
		this.settings.showWarnings = (settings && !!settings.showWarning);

		// Send the command forward to the NGI.InspectorPane, retrieving the state
		var visible = this.pane.toggle();
		if (visible) {
			NGI.App.inspectApps();
		} else {
			NGI.App.stopObservers();
			NGI.Scope.stopObservers();
		}
	}

	// Debugging utlity, to be used in the console. Retrieves the "breadcrumb" of
	// a specific scope in the hierarchy usage: ngInspector.scope('002')
	window.$scopeId = function(id) {

		function findRoot(el) {
			var child = el.firstChild;
			if (!child) return;
			do {
				var $el = angular.element(el);

				if ($el.data('$scope')) {
					return $el.data('$scope').$root;
				}

				var res = findRoot(child);
				if (res) return res;

			} while (child = child.nextSibling);
		}

		function dig(scope, breadcrumb) {
			var newBreadcrumb = breadcrumb.slice(0);
			newBreadcrumb.push(scope.$id);

			if (scope.$id == id) {
				console.log(newBreadcrumb);
				return scope;
			}

			var child = scope.$$childHead;

			if (!child) return;

			do {
				var res = dig(child, newBreadcrumb);
				if (res) return res;
			} while (child = child.$$nextSibling);

		}

		return dig(findRoot(document), []);
	};

};
},{"./App":1,"./InspectorPane":5,"./Scope":10}],4:[function(require,module,exports){
// `NGi.InspectorAgent` is responsible for the page introspection (Scope and DOM
// traversal)

var NGI = {
	Scope: require('./Scope')
};

function InspectorAgent() {}

function traverseDOM(app, node) {

	// Counter for the recursions being scheduled with setTimeout
	var nodeQueue = 1;
	traverse(node, app);

	// The recursive DOM traversal function
	function traverse(node, app) {

		// We can skip all nodeTypes except ELEMENT and DOCUMENT nodes
		if (node.nodeType === Node.ELEMENT_NODE ||
			 node.nodeType === Node.DOCUMENT_NODE) {

			// Wrap the DOM node to get access to angular.element methods
			var $node = window.angular.element(node);

			var nodeData = $node.data();

			// If there's no AngularJS metadata in the node .data() store, we
			// just move on
			if (nodeData && Object.keys(nodeData).length > 0) {

				// Match nodes with scopes attached to the relevant TreeViewItem
				var $scope = nodeData.$scope;
				if ($scope) {
					var scopeMatch = NGI.Scope.get($scope.$id);
					if (scopeMatch) {
						scopeMatch.setNode(node);
						app.probe(node, scopeMatch, false);
					}
				}

				// Match nodes with isolate scopes attached to the relevant
				// TreeViewItem
				if ($node.isolateScope) {
					var $isolate = $node.isolateScope();
					if ($isolate) {	
						var isolateMatch = NGI.Scope.get($isolate.$id);
						if (isolateMatch) {
							isolateMatch.setNode(node);
							app.probe(node, isolateMatch, true);
						}
					}
				}
			}

			if (node.firstChild) {
				var child = node.firstChild;
				do {
					// Increment the probed nodes counter, will be used for reporting
					nodeQueue++;

					// setTimeout is used to make the traversal asyncrhonous, keeping
					// the browser UI responsive during traversal.
					setTimeout(traverse.bind(this, child, app));
				} while (child = child.nextSibling);
			}

		}
		nodeQueue--;
		if (--nodeQueue === 0) {
			// Done
		}
		
	}
}

function traverseScopes(ngScope, app, callback) {

	var scopeQueue = 1;
	traverse(ngScope);

	function traverse(ngScope) {
		var scopeRep = NGI.Scope.instance(app, ngScope);
		scopeRep.startObserver();

		if (ngScope.$parent) {
			var parent = NGI.Scope.get(ngScope.$parent.$id).view;
			parent.addChild(scopeRep.view);
		} else {
			app.view.addChild(scopeRep.view);
		}

		var child = ngScope.$$childHead;
		if (child) {
			do {
				scopeQueue++;
				setTimeout(traverse.bind(this, child));
			} while (child = child.$$nextSibling);
		}

		if (--scopeQueue === 0) {
			// Done
			if (typeof callback === 'function') callback();
		}
	}
}

// Adds the TreeView item for the AngularJS application bootstrapped at
// the `node` argument.
InspectorAgent.inspectApp = function(app) {

	window.ngInspector.pane.treeView.appendChild(app.view.element);

	// With the root Node for the app, we retrieve the $rootScope
	var $node = window.angular.element(app.node);
	var $rootScope = $node.data('$scope').$root;

	// Then start the Scope traversal mechanism
	traverseScopes($rootScope, app, function() {

		// Once the Scope traversal is complete, the DOM traversal starts
		traverseDOM(app, app.node);
		
	});
};

InspectorAgent.inspectScope = function(app, scope) {
	traverseScopes(scope, app);
};

InspectorAgent.inspectNode = function(app, node) {
	traverseDOM(app, node);
};

InspectorAgent.findApps = function (App) {

	var nodeQueue = 1;

	// DOM Traversal to find AngularJS App root elements. Traversal is
	// interrupted when an App is found (traversal inside the App is done by the
	// InspectorAgent.inspectApp method)
	function traverse(node) {

		if (node.nodeType === Node.ELEMENT_NODE ||
			 node.nodeType === Node.DOCUMENT_NODE) {

			var $node = window.angular.element(node);

			if ($node.data('$injector')) {
				App.bootstrap(node);
			} else if (node.firstChild) {
				var child = node.firstChild;
				do {
					nodeQueue++;
					setTimeout(traverse.bind(this, child), 4);
				} while (child = child.nextSibling);
			}

			nodeQueue--;
			if (--nodeQueue === 0) {
				// Done
			}
		}
	}

	traverse(document);
};

module.exports = InspectorAgent;

},{"./Scope":10}],5:[function(require,module,exports){
/**
 * `NGI.InspectorPane` is responsible for the root element and basic interaction
 * with the pane (in practice, a <div>) injected in the page DOM, such as
 * toggling the pane on and off, handle mouse scrolling, resizing and first
 * level of child views.
 */

module.exports = function() {

	// The width of the pane can be resized by the user, and is persisted via
	// localStorage
	var inspectorWidth = localStorage.getItem('ng-inspector-width') || 300;

	// Quicker reference to body through-out InspectorPane lexical scope
	var body = document.body;

	// Create the root DOM node for the inspector pane
	var pane = document.createElement('div');
	pane.className = 'ngi-inspector';
	pane.style.width = inspectorWidth + 'px';

	// Create and expose the root DOM node for the treeView
	this.treeView = document.createElement('div');
	pane.appendChild(this.treeView);

	this.addView = function(view) {
		pane.appendChild(view);
	};

	this.clear = function() {
		while(this.treeView.lastChild) {
			this.treeView.removeChild(this.treeView.lastChild);
		}
	};

	// Used to avoid traversing or inspecting the extension UI
	this.contains = function(node) {
		return this.treeView.contains(node);
	};

	this.visible = false;

	// Toggle the inspector pane on and off. Returns a boolean representing the
	// new visibility state.
	this.toggle = function() {
		var events = {
			mousemove: {fn: onMouseMove, target: document},
			mousedown: {fn: onMouseDown, target: document},
			mouseup: {fn: onMouseUp, target: document},
			resize: {fn: onResize, target: window}
		};

		if ( pane.parentNode ) {
			body.removeChild(pane);
			this.clear();
			eventListenerBulk(events, true);
			body.classList.remove('ngi-open');
			return this.visible = false;
		} else {
			body.appendChild(pane);
			eventListenerBulk(events, false);
			body.classList.add('ngi-open');
			return this.visible = true;
		}
	};

	// Prevent scrolling the page when the scrolling inside the inspector pane
	// reaches the top and bottom limits
	pane.addEventListener('mousewheel', function(event) {
		if ((event.wheelDeltaY > 0 && pane.scrollTop === 0) ||
			(event.wheelDeltaY < 0 && (
				pane.scrollTop + pane.offsetHeight) === pane.scrollHeight
			)) {
			event.preventDefault();
		}
	});

	// Catch clicks at the top of the pane, and stop them, to prevent
	// triggering behavior in the app being inspected
	pane.addEventListener('click', function(event) {
		event.stopPropagation();
	});

	// States for the inspector pane resizing functionality
	var isResizing = false;
	var canResize = false;

	// Defines how many pixels to the left and right of the border of the pane
	// are considered within the resize handle
	var LEFT_RESIZE_HANDLE_PAD = 3;
	var RIGHT_RESIZE_HANDLE_PAD = 2;
	var MINIMUM_WIDTH = 50;
	var MAXIMUM_WIDTH = 100;

	// Listen for mousemove events in the page body, setting the canResize state
	// if the mouse hovers close to the
	function onMouseMove(event) {

		// Don't do anything if the inspector is detached from the DOM
		if (!pane.parentNode) return;

		// Check if the mouse cursor is currently hovering the resize handle,
		// consisting of the vertical pixel column of the inspector border plus
		// a pad of pixel columns to the left and right. The class added to
		// the page body is used for styling the cursor to `col-resize`
		if (pane.offsetLeft - LEFT_RESIZE_HANDLE_PAD <= event.clientX &&
			event.clientX <= pane.offsetLeft + RIGHT_RESIZE_HANDLE_PAD) {
			canResize = true;
			body.classList.add('ngi-resize');
		} else {
			canResize = false;
			body.classList.remove('ngi-resize');
		}

		// If the user is currently performing a resize, the width is adjusted
		// based on the cursor position
		if (isResizing) {

			var width = (window.innerWidth - event.clientX);

			// Enforce minimum and maximum limits
			if (width >= window.innerWidth - MINIMUM_WIDTH) {
				width = window.innerWidth - MINIMUM_WIDTH;
			} else if (width <= MAXIMUM_WIDTH) {
				width = MAXIMUM_WIDTH;
			}

			pane.style.width = width + 'px';
		}
	}

	// Listen to mousedown events in the page body, triggering the resize mode
	// (isResizing) if the cursor is within the resize handle (canResize). The
	// class added to the page body styles it to disable text selection while the
	// user dragging the mouse to resize the pane
	function onMouseDown() {
		if (canResize) {
			isResizing = true;
			body.classList.add('ngi-resizing');
		}
	}


	// Listen to mouseup events on the page, turning off the resize mode if one
	// is underway. The inspector width is then persisted in the localStorage
	function onMouseUp() {
		if (isResizing) {
			isResizing = false;
			body.classList.remove('ngi-resizing');
			localStorage.setItem('ng-inspector-width', pane.offsetWidth);
		}
	}

	// If the user contracts the window, this makes sure the pane won't end up
	// wider thant the viewport
	function onResize() {
		if (pane.offsetWidth >= body.offsetWidth - MINIMUM_WIDTH) {
			pane.style.width = (body.offsetWidth - MINIMUM_WIDTH) + 'px';
		}
	}

	// Can perform a mapping of events/functions to addEventListener
	// or removeEventListener, to prevent code duplication when bulk adding/removing
	function eventListenerBulk(eventsObj, remove) {
		var eventListenerFunc = remove ? 'removeEventListener' : 'addEventListener';
		Object.keys(eventsObj).forEach(function(event) {
			eventsObj[event].target[eventListenerFunc](event, eventsObj[event].fn);
		});
	}

};
},{}],6:[function(require,module,exports){
var NGI = {
	TreeView: require('./TreeView'),
	ModelMixin: require('./ModelMixin'),
	Utils: require('./Utils')
};

function Model(key, value, depth) {

	this.key = key;
	this.value = value;
	this.ngiType = 'Model';

	//TODO check for memory leaks
	this.view = NGI.TreeView.modelItem(this, depth);

	var valSpan = document.createElement('span');
	valSpan.className = 'ngi-value';

	NGI.ModelMixin.extend(this);

	this.setValue = function(newValue) {

		this.value = value = newValue;

		// String
		if (angular.isString(value)) {
			this.view.setType('ngi-model-string');
			if (value.trim().length > 25) {
				valSpan.textContent = '"' + value.trim().substr(0, 25) + ' (...)"';
				this.view.setIndicator(value.length);
			}
			else {
				valSpan.textContent = '"' + value.trim() + '"';
			}
		}

		// Function
		else if (angular.isFunction(value)) {
			this.view.setType('ngi-model-function');
			var args = NGI.Utils.annotate(value).join(', ');
			valSpan.textContent = 'function(' + args + ') {...}';
		}

		// Circular
		else if (depth.indexOf(value) >= 0) {
			this.view.setType('ngi-model-circular');
			valSpan.textContent = 'circular reference';
		}

		// NULL
		else if (value === null) {
			this.view.setType('ngi-model-null');
			valSpan.textContent = 'null';
		}

		// Array
		else if (angular.isArray(value)) {
			this.view.setType('ngi-model-array');
			var length = value.length;
			if (length === 0) {
				valSpan.textContent = '[ ]';
			}
			else {
				valSpan.textContent = '[...]';
				this.view.setIndicator(length);
			}
			this.view.makeCollapsible(true, true);
			this.update(value, depth.concat([this.value]), Model);
		}

		// DOM Element
		else if (angular.isElement(value)) {
			this.view.setType('ngi-model-element');
			valSpan.textContent = '<' + value.tagName + '>';
		}

		// Object
		else if (angular.isObject(value)) {
			this.view.setType('ngi-model-object');
			var length = Object.keys(value).length;
			if (length === 0) {
				valSpan.textContent = '{ }';
			}
			else {
				valSpan.textContent = '{...}';
				this.view.setIndicator(length);
			}
			this.view.makeCollapsible(true, true);
			this.update(value, depth.concat([this.value]), Model);
		}

		// Boolean
		else if (typeof value === 'boolean') {
			this.view.setType('ngi-model-boolean');
			valSpan.textContent = value;
		}

		// Number
		else if (angular.isNumber(value)) {
			this.view.setType('ngi-model-number');
			valSpan.textContent = value;
		}

		// Undefined
		else {
			this.view.setType('ngi-model-undefined');
			valSpan.textContent = 'undefined';
		}

	};
	this.setValue(value);

	this.view.label.appendChild(document.createTextNode(' '));
	this.view.label.appendChild(valSpan);
}

Model.instance = function(key, value, depth) {
	return new Model(key, value, depth);
};

module.exports = Model;

},{"./ModelMixin":7,"./TreeView":12,"./Utils":13}],7:[function(require,module,exports){
function getUserDefinedKeys(values) {
	return Object.keys(values).filter(function(key) {
		return !isPrivateAngularProp(key);
	});
}

function isPrivateAngularProp(propName) {
	var PRIVATE_KEY_BLACKLIST = ['$parent', '$root', '$id'];
	var ANGULAR_PRIVATE_PREFIX = '$$';
	var firstTwoChars = propName[0] + propName[1];

	if (firstTwoChars === ANGULAR_PRIVATE_PREFIX) return true;
	if (PRIVATE_KEY_BLACKLIST.indexOf(propName) > -1 || propName === 'this') return true;
	return false;
}

function arrayDiff(a, b) {
	var i, ret = { added: [], removed: [], existing: [] };

	// Iterate through b checking for added and existing elements
	for (i = 0; i < b.length; i++) {
		if (a.indexOf(b[i]) < 0) {
			ret.added.push(b[i]);
		} else {
			ret.existing.push(b[i]);
		}
	}

	// Iterate through a checking for removed elements
	for (i = 0; i < a.length; i++) {
		if (b.indexOf(a[i]) < 0) {
			ret.removed.push(a[i]);
		}
	}

	return ret;
}

function ModelMixin() {}

ModelMixin.update = function(values, depth, Model) {

	if (typeof this.modelObjs === 'undefined') this.modelObjs = {};
	if (typeof this.modelKeys === 'undefined') this.modelKeys = [];

	var newKeys = getUserDefinedKeys(values),
			diff = arrayDiff(this.modelKeys, newKeys),
			i, key;

	// Removed keys
	for (i = 0; i < diff.removed.length; i++) {
		var key = diff.removed[i];
		this.modelObjs[key].view.destroy();
		delete this.modelObjs[key];
	}
	
	// New keys
	for (i = 0; i < diff.added.length; i++) {
		key = diff.added[i];
		this.modelObjs[key] = Model.instance(key, values[key], depth.concat([values]));
		var insertAtTop = this.ngiType === 'Scope';
		this.view.addChild(this.modelObjs[key].view, insertAtTop);
	}

	// Updated keys
	for (i = 0; i < diff.existing.length; i++) {
		key = diff.existing[i];
		if (!this.modelObjs[key]) {
			var inst = this.ngiType === 'Scope' ? 'Scope' : this.ngiType === 'Model' ? 'Model' : 'UNKNOWN INSTANCE';
			continue;
		}
		this.modelObjs[key].setValue(values[key]);
	}

	this.modelKeys = newKeys;
};

ModelMixin.extend = function(obj) {
	obj.update = ModelMixin.update.bind(obj);
};

module.exports = ModelMixin;

},{}],8:[function(require,module,exports){
var NGI = {
	Service: require('./Service')
};

function Module(app, name) {

	// The AngularJS module name
	this.name = name;

	// Array with `NGI.Module` instance references
	this.requires = [];

	// The AngularJS module instance
	this.ngModule = window.angular.module(name);

	// `NGI.Service` instances representing services defined in this module
	this.services = NGI.Service.parseQueue(app, this.ngModule);
}

// A cache with all NGI.Module instances
var moduleCache = [];

Module.register = function(app, name) {
	// Ensure only a single `NGI.Module` instance exists for each AngularJS
	// module name
	if (typeof name === typeof '' && !moduleCache[name]) {
		moduleCache[name] = new Module(app, name);

		// Register the dependencies
		var requires = moduleCache[name].ngModule.requires;
		for (var i = 0; i < requires.length; i++) {
			var dependency = Module.register(app, requires[i]);
			moduleCache[name].requires.push(dependency);
		}
	}

	return moduleCache[name];
};

module.exports = Module;

},{"./Service":11}],9:[function(require,module,exports){
module.exports = function(command, payload, origin) {
    var msg = JSON.stringify({
        command: command,
        payload: payload
    });
    window.postMessage(msg, origin || '*');
};
},{}],10:[function(require,module,exports){
var NGI = {
	TreeView: require('./TreeView'),
	ModelMixin: require('./ModelMixin'),
	InspectorAgent: require('./InspectorAgent'),
	Model: require('./Model')
};

function Scope(app, ngScope, isIsolate) {

	var angular = window.angular;

	this.app = app;
	this.ngScope = ngScope;
	this.ngiType = 'Scope';

	// Calculate the scope depth in the tree to determine the intendation level
	// in the TreeView
	var reference = ngScope;
	var depth = [reference];
	while (reference = reference.$parent) { depth.push(reference); }

	// Instantiate and expose the TreeViewItem representing the scope
	var view = this.view = NGI.TreeView.scopeItem(ngScope.$id, depth, isIsolate);
	if (isIsolate) this.view.element.classList.add('ngi-isolate-scope');

	// Called when the `NGI.InspectorAgent` DOM traversal finds a Node match
	// for the scope
	this.setNode = function(node) {
		this.node = this.view.node = node;
	};

	function childScopeIds() {
		if (!ngScope.$$childHead) return [];
		var childKeys = [];
		var childScope = ngScope.$$childHead;
		do {
			childKeys.push(childScope.$id);
		} while (childScope = childScope.$$nextSibling);
		return childKeys;
	}

	var oldChildIds = childScopeIds();

	var destroyDeregister = angular.noop;
	var watchDeregister = angular.noop;
	var observerOn = false;

	NGI.ModelMixin.extend(this);
	this.update(ngScope, depth, NGI.Model);

	this.startObserver = function() {
		if (observerOn === false) {
			var scopeObj = this;
			destroyDeregister = ngScope.$on('$destroy', function() {
				view.destroy();
			});
			watchDeregister = ngScope.$watch(function() {

				// Scopes: basic check for mutations in the direct child scope list
				var newChildIds = childScopeIds();
				if (!angular.equals(oldChildIds, newChildIds)) {
					NGI.InspectorAgent.inspectScope(app, ngScope);
				}
				oldChildIds = newChildIds;

				// Models
				scopeObj.update(ngScope, depth, NGI.Model);

			});
			observerOn = true;
		}
	};

	this.stopObserver = function() {
		if (observerOn === true) {
			if (typeof destroyDeregister === 'function') {
				destroyDeregister.apply();
			}
			if (typeof watchDeregister === 'function') {
				watchDeregister.apply();
			}
			observerOn = false;
		}
	};

}

// To easily retrieve an `NGI.Scope` instance by the scope id, we keep a
// cache of created instances
var scopeCache = {};

// Expose stopObservers to stop observers from all scopes in `scopeCache` when
// the inspector pane is toggled off
Scope.stopObservers = function() {
	for (var i = 0; i < scopeCache.length; i++) {
		scopeCache[i].stopObserver();
	}
};

// Returns an instance of `NGI.Scope` representing the AngularJS scope with
// the id
Scope.get = function(id) {
	return scopeCache[id];
};

// This is the method used by `NGI.InspectorAgent` to instantiate the
// `NGI.Scope` object
Scope.instance = function(app, ngScope, isIsolate) {
	if (scopeCache[ngScope.$id]) {
		return scopeCache[ngScope.$id];
	}
	var scope = new Scope(app, ngScope, isIsolate);
	scopeCache[ngScope.$id] = scope;
	return scope;
};

module.exports = Scope;

},{"./InspectorAgent":4,"./Model":6,"./ModelMixin":7,"./TreeView":12}],11:[function(require,module,exports){
var NGI = {
	Utils: require('./Utils')
};

var CLASS_DIRECTIVE_REGEXP = /(([\d\w\-_]+)(?:\:([^;]+))?;?)/;

function Service(app, module, invoke) {
	this.provider = invoke[0];
	this.type = invoke[1];
	this.definition = invoke[2];
	this.name = (typeof this.definition[0] === typeof '') ? this.definition[0] : null;
	this.factory = this.definition[1];
	
	switch(this.provider) {
		case '$compileProvider':

			var dir;

			try {
				dir = app.$injector.invoke(this.factory);
			} catch(err) {
				return console.warn(
					'ng-inspector: An error occurred attempting to invoke directive: ' +
					(this.name || '(unknown)'),
					err
				);
			}

			if (!dir) dir = {};
			var restrict = dir.restrict || 'AE';
			var name = this.name;

			app.registerProbe(function(node, scope, isIsolate) {

				if (node === document) {
					node = document.getElementsByTagName('html')[0];
				}

				// Test for Attribute Comment directives (with replace:true for the
				// latter)
				if (restrict.indexOf('A') > -1 ||
					(dir.replace === true && restrict.indexOf('M') > -1)) {
					for (var i = 0; i < node.attributes.length; i++) {
						var normalized = NGI.Utils.directiveNormalize(node.attributes[i].name);
						if (normalized === name) {
							if (!isIsolate && dir.scope === true ||
								isIsolate && typeof dir.scope === typeof {}) {
								scope.view.addAnnotation(name, Service.DIR);
							}
						}
					}
				}

				// Test for Element directives
				if (restrict.indexOf('E') > -1) {
					var normalized = NGI.Utils.directiveNormalize(node.tagName.toLowerCase());
					if (normalized === name) {
						if (!isIsolate && dir.scope === true ||
							isIsolate && typeof dir.scope === typeof {}) {
							scope.view.addAnnotation(name, Service.DIR);
						}
					}
				}

				// Test for Class directives
				if (restrict.indexOf('C') > -1) {
					var matches = CLASS_DIRECTIVE_REGEXP.exec(node.className);
					if (matches) {
						for (var i = 0; i < matches.length; i++) {
							if (!matches[i]) continue;
							var normalized = NGI.Utils.directiveNormalize(matches[i]);
							if (normalized === name) {
								if (!isIsolate && dir.scope === true ||
									isIsolate && typeof dir.scope === typeof {}) {
									scope.view.addAnnotation(name, Service.DIR);
								}
							}
						}
					}
				}

			});
			break;
		case '$controllerProvider':

			app.registerProbe(function(node, scope) {

				if (node === document) {
					node = document.getElementsByTagName('html')[0];
				}

				// Test for the presence of the ngController directive
				for (var i = 0; i < node.attributes.length; i++) {
					var normalized = NGI.Utils.directiveNormalize(node.attributes[i].name);
					if (normalized === 'ngController') {
						scope.view.addAnnotation(node.attributes[i].value, Service.CTRL);
					}
				}

			});

			break;
	}
}

Service.CTRL = 1;
Service.DIR = 2;
Service.BUILTIN = 4;

Service.parseQueue = function(app, module) {
	var arr = [],
			queue = module._invokeQueue,
			tempQueue, i, j;
	for (i = 0; i < queue.length; i++) {
		if (queue[i][2].length === 1 && !(queue[i][2][0] instanceof Array)) {
			for (j in queue[i][2][0]) {
				if (Object.hasOwnProperty.call(queue[i][2][0], j)) {
					tempQueue = queue[i].slice();
					tempQueue[2] = [Object.keys(queue[i][2][0])[j], queue[i][2][0][j]];
					arr.push(new Service(app, module, tempQueue));
				}
			}
		} else {
			arr.push(new Service(app, module, queue[i]));
		}
	}
	return arr;
};

module.exports = Service;

},{"./Utils":13}],12:[function(require,module,exports){
var NGI = {
	Service: require('./Service'),
	Highlighter: require('./Highlighter')
};

function TreeViewItem(label) {

	this.element = document.createElement('div');

	// Store reference to itself. Needed for delegated mouseover
	this.element.item = this;

	// Accepts a label DOM Node or a string
	if (typeof label === 'string' || typeof label === 'number') {
		this.label = document.createElement('label');
		this.label.textContent = label;
	} else if (!!label.tagName) {
		this.label = label;
	}
	this.element.appendChild(this.label);

	this.drawer = document.createElement('div');
	this.drawer.className = 'ngi-drawer';
	this.element.appendChild(this.drawer);

	this.caret = document.createElement('span');
	this.caret.className = 'ngi-caret';

	this.length = null;

	var collapsed = false;
	this.setCollapsed = function(newState) {
		if (collapsed = newState) {
			this.element.classList.add('ngi-collapsed');
			this.element.classList.remove('ngi-expanded');
		} else {
			this.element.classList.remove('ngi-collapsed');
			this.element.classList.add('ngi-expanded');
		}
	};
	this.toggle = function(e) {
		e.stopPropagation();
		this.setCollapsed(!collapsed);
	};
	this.caret.addEventListener('click', this.toggle.bind(this));

	var isCollapsible = false;
	this.makeCollapsible = function(collapsibleState, initialState) {
		if (isCollapsible == collapsibleState) {
			return;
		}
		if (isCollapsible = collapsibleState) {
			this.label.appendChild(this.caret);
			this.setCollapsed(initialState || false);
		} else {
			this.label.removeChild(this.caret);
		}
	};

	this.addChild = function(childItem, top) {
		if (!!top) {
			this.drawer.insertBefore(childItem.element, this.drawer.firstChild);
		} else {
			this.drawer.appendChild(childItem.element);
		}
	};

	this.removeChildren = function(className) {
		for (var i = this.drawer.childNodes.length - 1; i >= 0; i--) {
			var child = this.drawer.childNodes[i];
			if (child.classList.contains(className)) {
				this.drawer.removeChild(child);
			}
		}
	};

	this.destroy = function() {
		if (this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
	};

	// Pill indicator
	var indicator = false;
	this.setIndicator = function(value) {
		if (indicator && typeof value !== 'number' && typeof value !== 'string') {
			indicator.parentNode.removeChild(indicator);
		} else {
			if (!indicator) {
				indicator = document.createElement('span');
				indicator.className = 'ngi-indicator';
				indicator.textContent = value;
				this.label.appendChild(indicator);
			}
		}
	};

	// Annotations (controller names, custom and built-in directive names)
	var annotations = [];
	this.addAnnotation = function(name, type) {
		if (annotations.indexOf(name) < 0) {
			annotations.push(name);
		} else {
			return;
		}
		var span = document.createElement('span');
		span.className = 'ngi-annotation';
		span.textContent = name;
		switch(type) {
			case NGI.Service.DIR:
				span.classList.add('ngi-annotation-dir');
				break;
			case NGI.Service.BUILTIN:
				span.classList.add('ngi-annotation-builtin');
				break;
			case NGI.Service.CTRL:
				span.classList.add('ngi-annotation-ctrl');
				break;
		}
		this.label.appendChild(span);
	};

	// Model types
	var type = null;
	this.setType = function(newType) {
		if (type) {
			this.element.classList.remove(type);
		}
		this.element.classList.add(newType);
		type = newType;
	};

}

function TreeView() {}

// Creates a TreeViewItem instance, with styling and metadata relevant for
// AngularJS apps
TreeView.appItem = function(label, node) {
	if (node === document) node = document.querySelector('html');
	var item = new TreeViewItem(label);
	item.node = node;
	item.element.className = 'ngi-app';

	// Highlight DOM elements the scope is attached to when hovering the item
	// in the inspector
	item.element.addEventListener('mouseover', function(event) {
		if(event.target.nodeName === 'LABEL' && event.target.parentNode.classList.contains('ngi-scope')) {
			// Do not add a layer when mouse comes from ngi-annotation
			if (event.relatedTarget && event.relatedTarget.classList.contains('ngi-annotation')) return false;

			var item = event.target.parentNode.item;
			if ( item.node && !window.ngInspector.pane.isResizing) {
				var target = (item.node === document) ?
					document.querySelector('html') : item.node;
				// target.classList.add('ngi-highlight');
				NGI.Highlighter.hl(target);
			}
		}
	});
	item.element.addEventListener('mouseout', function(event) {
		if(event.target.nodeName === 'LABEL' && event.target.parentNode.classList.contains('ngi-scope')) {
			// Do not remove the layer when mouse leaves for ngi-annotation
			if (event.relatedTarget.classList.contains('ngi-annotation')) return false;

			var item = event.target.parentNode.item;
			if (item.node) {
				NGI.Highlighter.clear();
			}
		}
	});

    return item;
};

// Creates a TreeViewItem instance, with styling and metadata relevant for
// AngularJS scopes
TreeView.scopeItem = function(label, depth, isIsolate) {
	var item = new TreeViewItem(label);
	item.element.className = 'ngi-scope';
	item.makeCollapsible(true, false);
	if (isIsolate) {
		item.element.classList.add('ngi-isolate-scope');
	}
	item.label.className = 'ngi-depth-' + depth.length;

	// console.log the DOM Node this scope is attached to
	item.label.addEventListener('click', function() {
		console.log(item.node);
	});

	return item;
};

// Creates a TreeViewItem instance, with styling and metadata relevant for
// AngularJS models
TreeView.modelItem = function(modelInstance, depth) {
	var item = new TreeViewItem(modelInstance.key + ':');
	item.element.className = 'ngi-model';
	item.label.className = 'ngi-depth-' + depth.length;

	item.label.addEventListener('click', function() {
		console.info(modelInstance.value);
	});

	return item;
};

module.exports = TreeView;
},{"./Highlighter":2,"./Service":11}],13:[function(require,module,exports){
var Utils = {};

var SPECIAL_CHARS_REGEXP = /([\:\-\_]+(.))/g;
var MOZ_HACK_REGEXP = /^moz([A-Z])/;

/**
 * Converts snake_case to camelCase.
 * Also a special case for Moz prefix starting with upper case letter.
 */
Utils.camelCase = function(name) {
	return name.
		replace(SPECIAL_CHARS_REGEXP, function(_, separator, letter, offset) {
			return offset ? letter.toUpperCase() : letter;
		}).
		replace(MOZ_HACK_REGEXP, 'Moz$1');
}

var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

var PREFIX_REGEXP = /^(x[\:\-_]|data[\:\-_])/i;
/**
 * Converts all accepted directives format into proper directive name.
 * All of these will become 'myDirective':
 *   my:Directive
 *   my-directive
 *   x-my-directive
 *   data-my:directive
 */
Utils.directiveNormalize = function(name) {
	return Utils.camelCase(name.replace(PREFIX_REGEXP, ''));
}

/**
 * Receives a service factory and returns an injection token. Only used in
 * older versions of AngularJS that did not expose `.annotate`
 *
 * Adapted from https://github.com/angular/angular.js/blob/0baa17a3b7ad2b242df2b277b81cebdf75b04287/src/auto/injector.js
 **/
Utils.annotate = function(fn) {
	var $inject, fnText, argDecl;

	if (typeof fn === 'function') {
		if (!($inject = fn.$inject)) {
			$inject = [];
			if (fn.length) {
				fnText = fn.toString().replace(STRIP_COMMENTS, '');
				argDecl = fnText.match(FN_ARGS);
				if(argDecl && argDecl[1]){
					var argDecls = argDecl[1].split(FN_ARG_SPLIT);
					for (var i = 0; i < argDecls.length; i++) {
						var arg = argDecls[i];
						arg.replace(FN_ARG, function(all, underscore, name) {
							$inject.push(name);
						});
					};
				}
			}
			fn.$inject = $inject;
		}
	} else if (Array.isArray(fn)) {
		$inject = fn.slice(0, fn.length - 1);
	} else {
		return false;
	}

	return $inject;
}

module.exports = Utils;

},{}],14:[function(require,module,exports){
var NGI = {
	Inspector: require('./Inspector'),
	App: require('./App'),
	PublishEvent: require('./PublishEvent')
};

var _angular;
var _bootstrap;


// Wrap Angular property (prior to being defined by angular itself)
// so we can be notified when Angular is present on the page, without
// having to resort to polling
Object.defineProperty(window, 'angular', {
	// enumerable: false to prevent other extensions (WAppalyzer, for example)
	// from thinking angular is present by checking "if (angular in window)"
	enumerable: false,
	configurable: true,
	get: function() { return _angular; },
	set: function(val) {
		_angular = val;
		wrapBootstrap();
		// Now that Angular is present on the page, allow the property to be
		// visible through reflection
		Object.defineProperty(window, 'angular', { enumerable: true });
		NGI.PublishEvent('ngi-angular-found');
	}
});

function wrapBootstrap() {
	// Hook Angular's manual bootstrapping mechanism to catch applications
	// that do not use the "ng-app" directive
	if (_angular.hasOwnProperty('bootstrap')) return;
	Object.defineProperty(_angular, 'bootstrap', {
		get: function() {
			// Return falsey val when angular hasn't assigned it's own bootstrap
			// prop yet, or will get warning about multiple angular versions loaded
			return _bootstrap ? modifiedBootstrap : null;
		},
		set: function(val) {
			_bootstrap = val;
		}
	});
}

var modifiedBootstrap = function(node, modules) {
	// Used to monkey-patch over angular.bootstrap, to allow the extension
	// to be notified when a manually-bootstrapped app has been found. Necessary
	// since we can't find the application by traversing the DOM looking for ng-app
	initializeInspector();

	// Continue with angular's native bootstrap method
	var ret = _bootstrap.apply(this, arguments);

	// Unwrap if jQuery or jqLite element
	if (node.jquery || node.injector) node = node[0];

	NGI.App.bootstrap(node, modules);

	return ret;
};

// Attempt to initialize inspector at the same time Angular's ng-app directive
// kicks off. If angular isn't found at this point, it has to be a manually
// bootstrapped app
document.addEventListener('DOMContentLoaded', initializeInspector);

function initializeInspector() {
	if (_angular && !window.ngInspector) {
		window.ngInspector = new NGI.Inspector();
	}
}

window.addEventListener('message', function (event) {
	if (event.origin !== window.location.origin) return;

	var eventData = event.data;
	if (!eventData || typeof eventData !== 'string') return;
	try {
		eventData = JSON.parse(eventData);
	} catch(e) {
		// Not a JSON object. Typically means another script on the page
		// is using postMessage. Safe to ignore
	}

	if (eventData.command === 'ngi-toggle') {
		// Fail if the inspector has not been initialized yet (before window.load)
		if (!window.ngInspector) {
			return console.warn('ng-inspector: The page must finish loading before using ng-inspector');
		}

		window.ngInspector.toggle(eventData.settings);
	}

}, false);
},{"./App":1,"./Inspector":3,"./PublishEvent":9}]},{},[14])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvanMvQXBwLmpzIiwic3JjL2pzL0hpZ2hsaWdodGVyLmpzIiwic3JjL2pzL0luc3BlY3Rvci5qcyIsInNyYy9qcy9JbnNwZWN0b3JBZ2VudC5qcyIsInNyYy9qcy9JbnNwZWN0b3JQYW5lLmpzIiwic3JjL2pzL01vZGVsLmpzIiwic3JjL2pzL01vZGVsTWl4aW4uanMiLCJzcmMvanMvTW9kdWxlLmpzIiwic3JjL2pzL1B1Ymxpc2hFdmVudC5qcyIsInNyYy9qcy9TY29wZS5qcyIsInNyYy9qcy9TZXJ2aWNlLmpzIiwic3JjL2pzL1RyZWVWaWV3LmpzIiwic3JjL2pzL1V0aWxzLmpzIiwic3JjL2pzL2Jvb3RzdHJhcC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgTkdJID0ge1xyXG5cdEluc3BlY3RvckFnZW50OiByZXF1aXJlKCcuL0luc3BlY3RvckFnZW50JyksXHJcblx0TW9kdWxlOiByZXF1aXJlKCcuL01vZHVsZScpLFxyXG5cdFRyZWVWaWV3OiByZXF1aXJlKCcuL1RyZWVWaWV3JyksXHJcblx0U2VydmljZTogcmVxdWlyZSgnLi9TZXJ2aWNlJylcclxufTtcclxuXHJcbmZ1bmN0aW9uIEFwcChub2RlLCBtb2R1bGVzKSB7XHJcblx0dmFyIHBhbmUgPSB3aW5kb3cubmdJbnNwZWN0b3IucGFuZTtcclxuXHR2YXIgYXBwID0gdGhpcztcclxuXHR2YXIgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihmdW5jdGlvbihtdXRhdGlvbnMpIHtcclxuXHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbXV0YXRpb25zLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdFx0dmFyIHRhcmdldCA9IG11dGF0aW9uc1tpXS50YXJnZXQ7XHJcblxyXG5cdFx0XHRcdC8vIEF2b2lkIHJlc3BvbmRpbmcgdG8gbXV0YXRpb25zIGluIHRoZSBleHRlbnNpb24gVUlcclxuXHRcdFx0XHRpZiAoIXBhbmUuY29udGFpbnModGFyZ2V0KSkge1xyXG5cdFx0XHRcdFx0Zm9yICh2YXIgZiA9IDA7IGYgPCBtdXRhdGlvbnNbaV0uYWRkZWROb2Rlcy5sZW5ndGg7IGYrKykge1xyXG5cdFx0XHRcdFx0XHR2YXIgYWRkZWROb2RlID0gbXV0YXRpb25zW2ldLmFkZGVkTm9kZXNbZl07XHJcblx0XHRcdFx0XHRcdGlmIChhZGRlZE5vZGUuY2xhc3NMaXN0ICYmICFhZGRlZE5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCduZ2ktaGwnKSkge1xyXG5cdFx0XHRcdFx0XHRcdE5HSS5JbnNwZWN0b3JBZ2VudC5pbnNwZWN0Tm9kZShhcHAsIGFkZGVkTm9kZSk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH0sIDQpO1xyXG5cdH0pO1xyXG5cdHZhciBvYnNlcnZlckNvbmZpZyA9IHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH07XHJcblxyXG5cdHRoaXMuc3RhcnRPYnNlcnZlciA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0b2JzZXJ2ZXIub2JzZXJ2ZShub2RlLCBvYnNlcnZlckNvbmZpZyk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5zdG9wT2JzZXJ2ZXIgPSBmdW5jdGlvbigpIHtcclxuXHRcdG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcclxuXHR9O1xyXG5cclxuXHR0aGlzLm5vZGUgPSBub2RlO1xyXG5cclxuXHR0aGlzLiRpbmplY3RvciA9IHdpbmRvdy5hbmd1bGFyLmVsZW1lbnQobm9kZSkuZGF0YSgnJGluamVjdG9yJyk7XHJcblx0XHJcblx0aWYgKCFtb2R1bGVzKSB7XHJcblx0XHRtb2R1bGVzID0gW107XHJcblx0fSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlcyA9PT0gdHlwZW9mICcnKSB7XHJcblx0XHRtb2R1bGVzID0gW21vZHVsZXNdO1xyXG5cdH1cclxuXHJcblx0dmFyIHByb2JlcyA9IFtidWlsdEluUHJvYmVdO1xyXG5cdHRoaXMucmVnaXN0ZXJQcm9iZSA9IGZ1bmN0aW9uKHByb2JlKSB7XHJcblx0XHRwcm9iZXMucHVzaChwcm9iZSk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5wcm9iZSA9IGZ1bmN0aW9uKG5vZGUsIHNjb3BlLCBpc0lzb2xhdGUpIHtcclxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgcHJvYmVzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdHByb2Jlc1tpXShub2RlLCBzY29wZSwgaXNJc29sYXRlKTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHQvLyBBdHRlbXB0IHRvIHJldHJpZXZlIHRoZSBwcm9wZXJ0eSBvZiB0aGUgbmdBcHAgZGlyZWN0aXZlIGluIHRoZSBub2RlIGZyb21cclxuXHQvLyBvbmUgb2YgdGhlIHBvc3NpYmxlIGRlY2xhcmF0aW9ucyB0byByZXRyaWV2ZSB0aGUgQW5ndWxhckpTIG1vZHVsZSBkZWZpbmVkXHJcblx0Ly8gYXMgdGhlIG1haW4gZGVwZW5kZW5jeSBmb3IgdGhlIGFwcC4gQW4gYW5vbnltb3VzIG5nQXBwIGlzIGEgdmFsaWQgdXNlXHJcblx0Ly8gY2FzZSwgc28gdGhpcyBpcyBvcHRpb25hbC5cclxuXHR2YXIgYXR0cnMgPSBbJ25nXFxcXDphcHAnLCAnbmctYXBwJywgJ3gtbmctYXBwJywgJ2RhdGEtbmctYXBwJ107XHJcblx0dmFyIG1haW47XHJcblx0aWYgKCdnZXRBdHRyaWJ1dGUnIGluIG5vZGUpIHtcclxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYXR0cnMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0aWYgKG5vZGUuaGFzQXR0cmlidXRlKGF0dHJzW2ldKSkge1xyXG5cdFx0XHRcdG1haW4gPSBub2RlLmdldEF0dHJpYnV0ZShhdHRyc1tpXSk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGlmIChtYWluKSB7XHJcblx0XHRcdG1vZHVsZXMucHVzaChtYWluKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdC8vIFJlZ2lzdGVyIG1vZHVsZSBkZXBlbmRlbmNpZXNcclxuXHRmb3IgKHZhciBtID0gMDsgbSA8IG1vZHVsZXMubGVuZ3RoOyBtKyspIHtcclxuXHRcdE5HSS5Nb2R1bGUucmVnaXN0ZXIodGhpcywgbW9kdWxlc1ttXSk7XHJcblx0fVxyXG5cclxuXHR2YXIgbGFiZWwgPSBtYWluID8gbWFpbiA6IG5vZGVSZXAobm9kZSk7XHJcblx0dGhpcy52aWV3ID0gTkdJLlRyZWVWaWV3LmFwcEl0ZW0obGFiZWwsIG5vZGUpO1xyXG5cdHdpbmRvdy5uZ0luc3BlY3Rvci5wYW5lLnRyZWVWaWV3LmFwcGVuZENoaWxkKHRoaXMudmlldy5lbGVtZW50KTtcclxufVxyXG5cclxuLy8gVGhpcyBwcm9iZSBpcyByZWdpc3RlcmVkIGJ5IGRlZmF1bHQgaW4gYWxsIGFwcHMsIGFuZCBwcm9iZXMgbm9kZXNcclxuLy8gZm9yIEFuZ3VsYXJKUyBidWlsdC1pbiBkaXJlY3RpdmVzIHRoYXQgYXJlIG5vdCBleHBvc2VkIGluIHRoZSBfaW52b2tlUXVldWVcclxuLy8gZGVzcGl0ZSB0aGUgJ25nJyBtb2R1bGUgYmVpbmcgYSBkZWZhdWx0IGRlcGVuZGVuY3lcclxuZnVuY3Rpb24gYnVpbHRJblByb2JlKG5vZGUsIHNjb3BlKSB7XHJcblxyXG5cdGlmIChub2RlID09PSBkb2N1bWVudCkge1xyXG5cdFx0bm9kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdodG1sJylbMF07XHJcblx0fVxyXG5cclxuXHRpZiAobm9kZSAmJiBub2RlLmhhc0F0dHJpYnV0ZSgnbmctcmVwZWF0JykpIHtcclxuXHRcdHNjb3BlLnZpZXcuYWRkQW5ub3RhdGlvbignbmdSZXBlYXQnLCBOR0kuU2VydmljZS5CVUlMVElOKTtcclxuXHR9XHJcblxyXG5cdC8vIExhYmVsIG5nLWluY2x1ZGUgc2NvcGVzXHJcblx0aWYgKG5vZGUgJiYgbm9kZS5oYXNBdHRyaWJ1dGUoJ25nLWluY2x1ZGUnKSkge1xyXG5cdFx0c2NvcGUudmlldy5hZGRBbm5vdGF0aW9uKCduZ0luY2x1ZGUnLCBOR0kuU2VydmljZS5CVUlMVElOKTtcclxuXHR9XHJcblxyXG5cdC8vIExhYmVsIG5nLWlmIHNjb3Blc1xyXG5cdGlmIChub2RlICYmIG5vZGUuaGFzQXR0cmlidXRlKCduZy1pZicpKSB7XHJcblx0XHRzY29wZS52aWV3LmFkZEFubm90YXRpb24oJ25nSWYnLCBOR0kuU2VydmljZS5CVUlMVElOKTtcclxuXHR9XHJcblxyXG5cdC8vIExhYmVsIHJvb3Qgc2NvcGVzXHJcblx0aWYgKHNjb3BlLm5nU2NvcGUuJHJvb3QuJGlkID09PSBzY29wZS5uZ1Njb3BlLiRpZCkge1xyXG5cdFx0c2NvcGUudmlldy5hZGRBbm5vdGF0aW9uKCckcm9vdFNjb3BlJywgTkdJLlNlcnZpY2UuQlVJTFRJTik7XHJcblx0fVxyXG5cclxuXHQvLyBMYWJlbCBuZy10cmFuc2NsdWRlIHNjb3Blc1xyXG5cdGlmIChub2RlICYmIG5vZGUucGFyZW50Tm9kZSAmJiBub2RlLnBhcmVudE5vZGUuaGFzQXR0cmlidXRlICYmXHJcblx0XHRub2RlLnBhcmVudE5vZGUuaGFzQXR0cmlidXRlKCduZy10cmFuc2NsdWRlJykpIHtcclxuXHRcdHNjb3BlLnZpZXcuYWRkQW5ub3RhdGlvbignbmdUcmFuc2NsdWRlJywgTkdJLlNlcnZpY2UuQlVJTFRJTik7XHJcblx0fVxyXG59XHJcblxyXG52YXIgYXBwQ2FjaGUgPSBbXTtcclxuQXBwLmJvb3RzdHJhcCA9IGZ1bmN0aW9uKG5vZGUsIG1vZHVsZXMpIHtcclxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGFwcENhY2hlLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRpZiAoYXBwQ2FjaGVbaV0ubm9kZSA9PT0gbm9kZSkge1xyXG5cdFx0XHRyZXR1cm4gYXBwQ2FjaGVbaV07XHJcblx0XHR9XHJcblx0fVxyXG5cdHZhciBuZXdBcHAgPSBuZXcgQXBwKG5vZGUsIG1vZHVsZXMpO1xyXG5cdGlmICh3aW5kb3cubmdJbnNwZWN0b3IucGFuZS52aXNpYmxlKSB7XHJcblx0XHROR0kuSW5zcGVjdG9yQWdlbnQuaW5zcGVjdEFwcChuZXdBcHApO1xyXG5cdFx0bmV3QXBwLnN0YXJ0T2JzZXJ2ZXIoKTtcclxuXHR9XHJcblx0YXBwQ2FjaGUucHVzaChuZXdBcHApO1xyXG59O1xyXG5cclxudmFyIGRpZEZpbmRBcHBzID0gZmFsc2U7XHJcblxyXG5BcHAuaW5zcGVjdEFwcHMgPSBmdW5jdGlvbigpIHtcclxuXHRpZiAoIWRpZEZpbmRBcHBzKSB7XHJcblx0XHROR0kuSW5zcGVjdG9yQWdlbnQuZmluZEFwcHMoQXBwKTtcclxuXHRcdGRpZEZpbmRBcHBzID0gdHJ1ZTtcclxuXHR9XHJcblxyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgYXBwQ2FjaGUubGVuZ3RoOyBpKyspIHtcclxuXHRcdE5HSS5JbnNwZWN0b3JBZ2VudC5pbnNwZWN0QXBwKGFwcENhY2hlW2ldKTtcclxuXHRcdGFwcENhY2hlW2ldLnN0YXJ0T2JzZXJ2ZXIoKTtcclxuXHR9XHJcbn07XHJcblxyXG5BcHAuc3RhcnRPYnNlcnZlcnMgPSBmdW5jdGlvbigpIHtcclxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGFwcENhY2hlLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRhcHBDYWNoZVtpXS5zdGFydE9ic2VydmVyKCk7XHJcblx0fVxyXG5cclxufTtcclxuXHJcbkFwcC5zdG9wT2JzZXJ2ZXJzID0gZnVuY3Rpb24oKSB7XHJcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBhcHBDYWNoZS5sZW5ndGg7IGkrKykge1xyXG5cdFx0YXBwQ2FjaGVbaV0uc3RvcE9ic2VydmVyKCk7XHJcblx0fVxyXG59O1xyXG5cclxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBET00gTm9kZSB0byBiZSBpbmplY3RlZCBpbiB0aGUgVUksXHJcbi8vIGRpc3BsYXlpbmcgYSB1c2VyLWZyaWVuZGx5IENTUyBzZWxlY3Rvci1saWtlIHJlcHJlc2VudGF0aW9uIG9mIGEgRE9NIE5vZGVcclxuLy8gaW4gdGhlIGluc3BlY3RlZCBhcHBsaWNhdGlvblxyXG5mdW5jdGlvbiBub2RlUmVwKG5vZGUpIHtcclxuXHR2YXIgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsYWJlbCcpO1xyXG5cclxuXHRpZiAobm9kZSA9PT0gZG9jdW1lbnQpIHtcclxuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gJ2RvY3VtZW50JztcclxuXHRcdHJldHVybiBsYWJlbDtcclxuXHR9XHJcblxyXG5cdC8vIHRhZ1xyXG5cdGxhYmVsLnRleHRDb250ZW50ID0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XHJcblxyXG5cdC8vICNpZFxyXG5cdGlmIChub2RlLmhhc0F0dHJpYnV0ZSgnaWQnKSkge1xyXG5cdFx0dmFyIHNtYWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc21hbGwnKTtcclxuXHRcdHNtYWxsLnRleHRDb250ZW50ID0gJyMnICsgbm9kZS5nZXRBdHRyaWJ1dGUoJ2lkJyk7XHJcblx0XHRsYWJlbC5hcHBlbmRDaGlsZChzbWFsbCk7XHJcblx0fVxyXG5cclxuXHQvLyAuY2xhc3MubGlzdFxyXG5cdHZhciBjbGFzc0xpc3QgPSBub2RlLmNsYXNzTmFtZS5zcGxpdCgvXFxzLyk7XHJcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBjbGFzc0xpc3QubGVuZ3RoOyBpKyspIHtcclxuXHRcdHZhciBzbWFsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NtYWxsJyk7XHJcblx0XHRzbWFsbC50ZXh0Q29udGVudCA9ICcuJyArIGNsYXNzTGlzdFtpXTtcclxuXHRcdGxhYmVsLmFwcGVuZENoaWxkKHNtYWxsKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiBsYWJlbDtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBcHA7XHJcbiIsImZ1bmN0aW9uIEhpZ2hsaWdodGVyKCkge31cclxuXHJcbmZ1bmN0aW9uIG9mZnNldHMobm9kZSkge1xyXG5cdHZhciB2YWxzID0ge1xyXG5cdFx0eDogbm9kZS5vZmZzZXRMZWZ0LFxyXG5cdFx0eTogbm9kZS5vZmZzZXRUb3AsXHJcblx0XHR3OiBub2RlLm9mZnNldFdpZHRoLFxyXG5cdFx0aDogbm9kZS5vZmZzZXRIZWlnaHRcclxuXHR9O1xyXG5cdHdoaWxlIChub2RlID0gbm9kZS5vZmZzZXRQYXJlbnQpIHtcclxuXHRcdHZhbHMueCArPSBub2RlLm9mZnNldExlZnQ7XHJcblx0XHR2YWxzLnkgKz0gbm9kZS5vZmZzZXRUb3A7XHJcblx0fVxyXG5cdHJldHVybiB2YWxzO1xyXG59XHJcblxyXG52YXIgaGxzID0gW107XHJcbkhpZ2hsaWdodGVyLmhsID0gZnVuY3Rpb24obm9kZSwgbGFiZWwpIHtcclxuXHR2YXIgYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcblx0Ym94LmNsYXNzTmFtZSA9ICduZ2ktaGwgbmdpLWhsLXNjb3BlJztcclxuXHRpZiAobGFiZWwpIHtcclxuXHRcdGJveC50ZXh0Q29udGVudCA9IGxhYmVsO1xyXG5cdH1cclxuXHR2YXIgcG9zID0gb2Zmc2V0cyhub2RlKTtcclxuXHRib3guc3R5bGUubGVmdCA9IHBvcy54ICsgJ3B4JztcclxuXHRib3guc3R5bGUudG9wID0gcG9zLnkgKyAncHgnO1xyXG5cdGJveC5zdHlsZS53aWR0aCA9IHBvcy53ICsgJ3B4JztcclxuXHRib3guc3R5bGUuaGVpZ2h0ID0gcG9zLmggKyAncHgnO1xyXG5cdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYm94KTtcclxuXHRobHMucHVzaChib3gpO1xyXG5cdHJldHVybiBib3g7XHJcbn07XHJcblxyXG5IaWdobGlnaHRlci5jbGVhciA9IGZ1bmN0aW9uKCkge1xyXG5cdHZhciBib3g7XHJcblx0d2hpbGUgKGJveCA9IGhscy5wb3AoKSkge1xyXG5cdFx0Ym94LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoYm94KTtcclxuXHR9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEhpZ2hsaWdodGVyO1xyXG4iLCJ2YXIgTkdJID0ge1xyXG5cdEluc3BlY3RvclBhbmU6IHJlcXVpcmUoJy4vSW5zcGVjdG9yUGFuZScpLFxyXG5cdEFwcDogcmVxdWlyZSgnLi9BcHAnKSxcclxuXHRTY29wZTogcmVxdWlyZSgnLi9TY29wZScpXHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG5cclxuXHQvLyBTZXR0aW5ncyBkZWZhdWx0c1xyXG5cdHRoaXMuc2V0dGluZ3MgPSB7XHJcblx0XHRzaG93V2FybmluZ3M6IGZhbHNlXHJcblx0fTtcclxuXHJcblx0dGhpcy5wYW5lID0gbmV3IE5HSS5JbnNwZWN0b3JQYW5lKCk7XHJcblxyXG5cdC8vIFRoZSBhY3R1YWwgdG9nZ2xpbmcgaXMgZG9uZSBieSB0aGUgYE5HSS5JbnNwZWN0b3JQYW5lYC4gU2luY2UgdGhlXHJcblx0Ly8gYG5nLWluc3BlY3Rvci5qc2Agc2NyaXB0IGlzIGluamVjdGVkIGludG8gdGhlIHBhZ2UgRE9NIHdpdGggbm8gZGlyZWN0XHJcblx0Ly8gYWNjZXNzIHRvIGBzYWZhcmkuZXh0ZW5zaW9uLnNldHRpbmdzYCwgc2V0dGluZ3MgY2FuIG9ubHkgYmUgc2VudCB2aWFcclxuXHQvLyBtZXNzYWdlcy4gVG8gc2F2ZSBvbiB0aGUgbnVtYmVyIG9mIG1lc3NhZ2VzIHNlbnQgYmFjayBhbmQgZm9ydGggYmV0d2VlblxyXG5cdC8vIHRoaXMgaW5qZWN0ZWQgc2NyaXB0IGFuZCB0aGUgYnJvd3NlciBleHRlbnNpb24sIHRoZSBicm93c2VyIHNldHRpbmdzIGFyZVxyXG5cdC8vIHNlbnQgYWxvbmcgd2l0aCB0aGUgdG9nZ2xlIGNvbW1hbmQuIEEgc2lkZSBlZmZlY3QgaXMgdGhhdCBjaGFuZ2VzIGluIHRoZVxyXG5cdC8vIHNldHRpbmdzIG9ubHkgdGFrZSBwbGFjZSBhZnRlciBhIHRvZ2dsZSBpcyB0cmlnZ2VyZWQuXHJcblx0dGhpcy50b2dnbGUgPSBmdW5jdGlvbihzZXR0aW5ncykge1xyXG5cclxuXHRcdC8vIElmIGFuZ3VsYXIgaXMgbm90IHByZXNlbnQgaW4gdGhlIGdsb2JhbCBzY29wZSwgd2Ugc3RvcCB0aGUgcHJvY2Vzc1xyXG5cdFx0aWYgKCEoJ2FuZ3VsYXInIGluIHdpbmRvdykpIHtcclxuXHRcdFx0YWxlcnQoJ1RoaXMgcGFnZSBkb2VzIG5vdCBpbmNsdWRlIEFuZ3VsYXJKUycpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gUGFzc2luZyB0aGUgc2V0dGluZ3MgcGFyYW1ldGVyIGlzIG9wdGlvbmFsXHJcblx0XHR0aGlzLnNldHRpbmdzLnNob3dXYXJuaW5ncyA9IChzZXR0aW5ncyAmJiAhIXNldHRpbmdzLnNob3dXYXJuaW5nKTtcclxuXHJcblx0XHQvLyBTZW5kIHRoZSBjb21tYW5kIGZvcndhcmQgdG8gdGhlIE5HSS5JbnNwZWN0b3JQYW5lLCByZXRyaWV2aW5nIHRoZSBzdGF0ZVxyXG5cdFx0dmFyIHZpc2libGUgPSB0aGlzLnBhbmUudG9nZ2xlKCk7XHJcblx0XHRpZiAodmlzaWJsZSkge1xyXG5cdFx0XHROR0kuQXBwLmluc3BlY3RBcHBzKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHROR0kuQXBwLnN0b3BPYnNlcnZlcnMoKTtcclxuXHRcdFx0TkdJLlNjb3BlLnN0b3BPYnNlcnZlcnMoKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdC8vIERlYnVnZ2luZyB1dGxpdHksIHRvIGJlIHVzZWQgaW4gdGhlIGNvbnNvbGUuIFJldHJpZXZlcyB0aGUgXCJicmVhZGNydW1iXCIgb2ZcclxuXHQvLyBhIHNwZWNpZmljIHNjb3BlIGluIHRoZSBoaWVyYXJjaHkgdXNhZ2U6IG5nSW5zcGVjdG9yLnNjb3BlKCcwMDInKVxyXG5cdHdpbmRvdy4kc2NvcGVJZCA9IGZ1bmN0aW9uKGlkKSB7XHJcblxyXG5cdFx0ZnVuY3Rpb24gZmluZFJvb3QoZWwpIHtcclxuXHRcdFx0dmFyIGNoaWxkID0gZWwuZmlyc3RDaGlsZDtcclxuXHRcdFx0aWYgKCFjaGlsZCkgcmV0dXJuO1xyXG5cdFx0XHRkbyB7XHJcblx0XHRcdFx0dmFyICRlbCA9IGFuZ3VsYXIuZWxlbWVudChlbCk7XHJcblxyXG5cdFx0XHRcdGlmICgkZWwuZGF0YSgnJHNjb3BlJykpIHtcclxuXHRcdFx0XHRcdHJldHVybiAkZWwuZGF0YSgnJHNjb3BlJykuJHJvb3Q7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHR2YXIgcmVzID0gZmluZFJvb3QoY2hpbGQpO1xyXG5cdFx0XHRcdGlmIChyZXMpIHJldHVybiByZXM7XHJcblxyXG5cdFx0XHR9IHdoaWxlIChjaGlsZCA9IGNoaWxkLm5leHRTaWJsaW5nKTtcclxuXHRcdH1cclxuXHJcblx0XHRmdW5jdGlvbiBkaWcoc2NvcGUsIGJyZWFkY3J1bWIpIHtcclxuXHRcdFx0dmFyIG5ld0JyZWFkY3J1bWIgPSBicmVhZGNydW1iLnNsaWNlKDApO1xyXG5cdFx0XHRuZXdCcmVhZGNydW1iLnB1c2goc2NvcGUuJGlkKTtcclxuXHJcblx0XHRcdGlmIChzY29wZS4kaWQgPT0gaWQpIHtcclxuXHRcdFx0XHRjb25zb2xlLmxvZyhuZXdCcmVhZGNydW1iKTtcclxuXHRcdFx0XHRyZXR1cm4gc2NvcGU7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHZhciBjaGlsZCA9IHNjb3BlLiQkY2hpbGRIZWFkO1xyXG5cclxuXHRcdFx0aWYgKCFjaGlsZCkgcmV0dXJuO1xyXG5cclxuXHRcdFx0ZG8ge1xyXG5cdFx0XHRcdHZhciByZXMgPSBkaWcoY2hpbGQsIG5ld0JyZWFkY3J1bWIpO1xyXG5cdFx0XHRcdGlmIChyZXMpIHJldHVybiByZXM7XHJcblx0XHRcdH0gd2hpbGUgKGNoaWxkID0gY2hpbGQuJCRuZXh0U2libGluZyk7XHJcblxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBkaWcoZmluZFJvb3QoZG9jdW1lbnQpLCBbXSk7XHJcblx0fTtcclxuXHJcbn07IiwiLy8gYE5HaS5JbnNwZWN0b3JBZ2VudGAgaXMgcmVzcG9uc2libGUgZm9yIHRoZSBwYWdlIGludHJvc3BlY3Rpb24gKFNjb3BlIGFuZCBET01cclxuLy8gdHJhdmVyc2FsKVxyXG5cclxudmFyIE5HSSA9IHtcclxuXHRTY29wZTogcmVxdWlyZSgnLi9TY29wZScpXHJcbn07XHJcblxyXG5mdW5jdGlvbiBJbnNwZWN0b3JBZ2VudCgpIHt9XHJcblxyXG5mdW5jdGlvbiB0cmF2ZXJzZURPTShhcHAsIG5vZGUpIHtcclxuXHJcblx0Ly8gQ291bnRlciBmb3IgdGhlIHJlY3Vyc2lvbnMgYmVpbmcgc2NoZWR1bGVkIHdpdGggc2V0VGltZW91dFxyXG5cdHZhciBub2RlUXVldWUgPSAxO1xyXG5cdHRyYXZlcnNlKG5vZGUsIGFwcCk7XHJcblxyXG5cdC8vIFRoZSByZWN1cnNpdmUgRE9NIHRyYXZlcnNhbCBmdW5jdGlvblxyXG5cdGZ1bmN0aW9uIHRyYXZlcnNlKG5vZGUsIGFwcCkge1xyXG5cclxuXHRcdC8vIFdlIGNhbiBza2lwIGFsbCBub2RlVHlwZXMgZXhjZXB0IEVMRU1FTlQgYW5kIERPQ1VNRU5UIG5vZGVzXHJcblx0XHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUgfHxcclxuXHRcdFx0IG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRE9DVU1FTlRfTk9ERSkge1xyXG5cclxuXHRcdFx0Ly8gV3JhcCB0aGUgRE9NIG5vZGUgdG8gZ2V0IGFjY2VzcyB0byBhbmd1bGFyLmVsZW1lbnQgbWV0aG9kc1xyXG5cdFx0XHR2YXIgJG5vZGUgPSB3aW5kb3cuYW5ndWxhci5lbGVtZW50KG5vZGUpO1xyXG5cclxuXHRcdFx0dmFyIG5vZGVEYXRhID0gJG5vZGUuZGF0YSgpO1xyXG5cclxuXHRcdFx0Ly8gSWYgdGhlcmUncyBubyBBbmd1bGFySlMgbWV0YWRhdGEgaW4gdGhlIG5vZGUgLmRhdGEoKSBzdG9yZSwgd2VcclxuXHRcdFx0Ly8ganVzdCBtb3ZlIG9uXHJcblx0XHRcdGlmIChub2RlRGF0YSAmJiBPYmplY3Qua2V5cyhub2RlRGF0YSkubGVuZ3RoID4gMCkge1xyXG5cclxuXHRcdFx0XHQvLyBNYXRjaCBub2RlcyB3aXRoIHNjb3BlcyBhdHRhY2hlZCB0byB0aGUgcmVsZXZhbnQgVHJlZVZpZXdJdGVtXHJcblx0XHRcdFx0dmFyICRzY29wZSA9IG5vZGVEYXRhLiRzY29wZTtcclxuXHRcdFx0XHRpZiAoJHNjb3BlKSB7XHJcblx0XHRcdFx0XHR2YXIgc2NvcGVNYXRjaCA9IE5HSS5TY29wZS5nZXQoJHNjb3BlLiRpZCk7XHJcblx0XHRcdFx0XHRpZiAoc2NvcGVNYXRjaCkge1xyXG5cdFx0XHRcdFx0XHRzY29wZU1hdGNoLnNldE5vZGUobm9kZSk7XHJcblx0XHRcdFx0XHRcdGFwcC5wcm9iZShub2RlLCBzY29wZU1hdGNoLCBmYWxzZSk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQvLyBNYXRjaCBub2RlcyB3aXRoIGlzb2xhdGUgc2NvcGVzIGF0dGFjaGVkIHRvIHRoZSByZWxldmFudFxyXG5cdFx0XHRcdC8vIFRyZWVWaWV3SXRlbVxyXG5cdFx0XHRcdGlmICgkbm9kZS5pc29sYXRlU2NvcGUpIHtcclxuXHRcdFx0XHRcdHZhciAkaXNvbGF0ZSA9ICRub2RlLmlzb2xhdGVTY29wZSgpO1xyXG5cdFx0XHRcdFx0aWYgKCRpc29sYXRlKSB7XHRcclxuXHRcdFx0XHRcdFx0dmFyIGlzb2xhdGVNYXRjaCA9IE5HSS5TY29wZS5nZXQoJGlzb2xhdGUuJGlkKTtcclxuXHRcdFx0XHRcdFx0aWYgKGlzb2xhdGVNYXRjaCkge1xyXG5cdFx0XHRcdFx0XHRcdGlzb2xhdGVNYXRjaC5zZXROb2RlKG5vZGUpO1xyXG5cdFx0XHRcdFx0XHRcdGFwcC5wcm9iZShub2RlLCBpc29sYXRlTWF0Y2gsIHRydWUpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAobm9kZS5maXJzdENoaWxkKSB7XHJcblx0XHRcdFx0dmFyIGNoaWxkID0gbm9kZS5maXJzdENoaWxkO1xyXG5cdFx0XHRcdGRvIHtcclxuXHRcdFx0XHRcdC8vIEluY3JlbWVudCB0aGUgcHJvYmVkIG5vZGVzIGNvdW50ZXIsIHdpbGwgYmUgdXNlZCBmb3IgcmVwb3J0aW5nXHJcblx0XHRcdFx0XHRub2RlUXVldWUrKztcclxuXHJcblx0XHRcdFx0XHQvLyBzZXRUaW1lb3V0IGlzIHVzZWQgdG8gbWFrZSB0aGUgdHJhdmVyc2FsIGFzeW5jcmhvbm91cywga2VlcGluZ1xyXG5cdFx0XHRcdFx0Ly8gdGhlIGJyb3dzZXIgVUkgcmVzcG9uc2l2ZSBkdXJpbmcgdHJhdmVyc2FsLlxyXG5cdFx0XHRcdFx0c2V0VGltZW91dCh0cmF2ZXJzZS5iaW5kKHRoaXMsIGNoaWxkLCBhcHApKTtcclxuXHRcdFx0XHR9IHdoaWxlIChjaGlsZCA9IGNoaWxkLm5leHRTaWJsaW5nKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdH1cclxuXHRcdG5vZGVRdWV1ZS0tO1xyXG5cdFx0aWYgKC0tbm9kZVF1ZXVlID09PSAwKSB7XHJcblx0XHRcdC8vIERvbmVcclxuXHRcdH1cclxuXHRcdFxyXG5cdH1cclxufVxyXG5cclxuZnVuY3Rpb24gdHJhdmVyc2VTY29wZXMobmdTY29wZSwgYXBwLCBjYWxsYmFjaykge1xyXG5cclxuXHR2YXIgc2NvcGVRdWV1ZSA9IDE7XHJcblx0dHJhdmVyc2UobmdTY29wZSk7XHJcblxyXG5cdGZ1bmN0aW9uIHRyYXZlcnNlKG5nU2NvcGUpIHtcclxuXHRcdHZhciBzY29wZVJlcCA9IE5HSS5TY29wZS5pbnN0YW5jZShhcHAsIG5nU2NvcGUpO1xyXG5cdFx0c2NvcGVSZXAuc3RhcnRPYnNlcnZlcigpO1xyXG5cclxuXHRcdGlmIChuZ1Njb3BlLiRwYXJlbnQpIHtcclxuXHRcdFx0dmFyIHBhcmVudCA9IE5HSS5TY29wZS5nZXQobmdTY29wZS4kcGFyZW50LiRpZCkudmlldztcclxuXHRcdFx0cGFyZW50LmFkZENoaWxkKHNjb3BlUmVwLnZpZXcpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0YXBwLnZpZXcuYWRkQ2hpbGQoc2NvcGVSZXAudmlldyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGNoaWxkID0gbmdTY29wZS4kJGNoaWxkSGVhZDtcclxuXHRcdGlmIChjaGlsZCkge1xyXG5cdFx0XHRkbyB7XHJcblx0XHRcdFx0c2NvcGVRdWV1ZSsrO1xyXG5cdFx0XHRcdHNldFRpbWVvdXQodHJhdmVyc2UuYmluZCh0aGlzLCBjaGlsZCkpO1xyXG5cdFx0XHR9IHdoaWxlIChjaGlsZCA9IGNoaWxkLiQkbmV4dFNpYmxpbmcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICgtLXNjb3BlUXVldWUgPT09IDApIHtcclxuXHRcdFx0Ly8gRG9uZVxyXG5cdFx0XHRpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSBjYWxsYmFjaygpO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxuLy8gQWRkcyB0aGUgVHJlZVZpZXcgaXRlbSBmb3IgdGhlIEFuZ3VsYXJKUyBhcHBsaWNhdGlvbiBib290c3RyYXBwZWQgYXRcclxuLy8gdGhlIGBub2RlYCBhcmd1bWVudC5cclxuSW5zcGVjdG9yQWdlbnQuaW5zcGVjdEFwcCA9IGZ1bmN0aW9uKGFwcCkge1xyXG5cclxuXHR3aW5kb3cubmdJbnNwZWN0b3IucGFuZS50cmVlVmlldy5hcHBlbmRDaGlsZChhcHAudmlldy5lbGVtZW50KTtcclxuXHJcblx0Ly8gV2l0aCB0aGUgcm9vdCBOb2RlIGZvciB0aGUgYXBwLCB3ZSByZXRyaWV2ZSB0aGUgJHJvb3RTY29wZVxyXG5cdHZhciAkbm9kZSA9IHdpbmRvdy5hbmd1bGFyLmVsZW1lbnQoYXBwLm5vZGUpO1xyXG5cdHZhciAkcm9vdFNjb3BlID0gJG5vZGUuZGF0YSgnJHNjb3BlJykuJHJvb3Q7XHJcblxyXG5cdC8vIFRoZW4gc3RhcnQgdGhlIFNjb3BlIHRyYXZlcnNhbCBtZWNoYW5pc21cclxuXHR0cmF2ZXJzZVNjb3Blcygkcm9vdFNjb3BlLCBhcHAsIGZ1bmN0aW9uKCkge1xyXG5cclxuXHRcdC8vIE9uY2UgdGhlIFNjb3BlIHRyYXZlcnNhbCBpcyBjb21wbGV0ZSwgdGhlIERPTSB0cmF2ZXJzYWwgc3RhcnRzXHJcblx0XHR0cmF2ZXJzZURPTShhcHAsIGFwcC5ub2RlKTtcclxuXHRcdFxyXG5cdH0pO1xyXG59O1xyXG5cclxuSW5zcGVjdG9yQWdlbnQuaW5zcGVjdFNjb3BlID0gZnVuY3Rpb24oYXBwLCBzY29wZSkge1xyXG5cdHRyYXZlcnNlU2NvcGVzKHNjb3BlLCBhcHApO1xyXG59O1xyXG5cclxuSW5zcGVjdG9yQWdlbnQuaW5zcGVjdE5vZGUgPSBmdW5jdGlvbihhcHAsIG5vZGUpIHtcclxuXHR0cmF2ZXJzZURPTShhcHAsIG5vZGUpO1xyXG59O1xyXG5cclxuSW5zcGVjdG9yQWdlbnQuZmluZEFwcHMgPSBmdW5jdGlvbiAoQXBwKSB7XHJcblxyXG5cdHZhciBub2RlUXVldWUgPSAxO1xyXG5cclxuXHQvLyBET00gVHJhdmVyc2FsIHRvIGZpbmQgQW5ndWxhckpTIEFwcCByb290IGVsZW1lbnRzLiBUcmF2ZXJzYWwgaXNcclxuXHQvLyBpbnRlcnJ1cHRlZCB3aGVuIGFuIEFwcCBpcyBmb3VuZCAodHJhdmVyc2FsIGluc2lkZSB0aGUgQXBwIGlzIGRvbmUgYnkgdGhlXHJcblx0Ly8gSW5zcGVjdG9yQWdlbnQuaW5zcGVjdEFwcCBtZXRob2QpXHJcblx0ZnVuY3Rpb24gdHJhdmVyc2Uobm9kZSkge1xyXG5cclxuXHRcdGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSB8fFxyXG5cdFx0XHQgbm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5ET0NVTUVOVF9OT0RFKSB7XHJcblxyXG5cdFx0XHR2YXIgJG5vZGUgPSB3aW5kb3cuYW5ndWxhci5lbGVtZW50KG5vZGUpO1xyXG5cclxuXHRcdFx0aWYgKCRub2RlLmRhdGEoJyRpbmplY3RvcicpKSB7XHJcblx0XHRcdFx0QXBwLmJvb3RzdHJhcChub2RlKTtcclxuXHRcdFx0fSBlbHNlIGlmIChub2RlLmZpcnN0Q2hpbGQpIHtcclxuXHRcdFx0XHR2YXIgY2hpbGQgPSBub2RlLmZpcnN0Q2hpbGQ7XHJcblx0XHRcdFx0ZG8ge1xyXG5cdFx0XHRcdFx0bm9kZVF1ZXVlKys7XHJcblx0XHRcdFx0XHRzZXRUaW1lb3V0KHRyYXZlcnNlLmJpbmQodGhpcywgY2hpbGQpLCA0KTtcclxuXHRcdFx0XHR9IHdoaWxlIChjaGlsZCA9IGNoaWxkLm5leHRTaWJsaW5nKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0bm9kZVF1ZXVlLS07XHJcblx0XHRcdGlmICgtLW5vZGVRdWV1ZSA9PT0gMCkge1xyXG5cdFx0XHRcdC8vIERvbmVcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0dHJhdmVyc2UoZG9jdW1lbnQpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBJbnNwZWN0b3JBZ2VudDtcclxuIiwiLyoqXHJcbiAqIGBOR0kuSW5zcGVjdG9yUGFuZWAgaXMgcmVzcG9uc2libGUgZm9yIHRoZSByb290IGVsZW1lbnQgYW5kIGJhc2ljIGludGVyYWN0aW9uXHJcbiAqIHdpdGggdGhlIHBhbmUgKGluIHByYWN0aWNlLCBhIDxkaXY+KSBpbmplY3RlZCBpbiB0aGUgcGFnZSBET00sIHN1Y2ggYXNcclxuICogdG9nZ2xpbmcgdGhlIHBhbmUgb24gYW5kIG9mZiwgaGFuZGxlIG1vdXNlIHNjcm9sbGluZywgcmVzaXppbmcgYW5kIGZpcnN0XHJcbiAqIGxldmVsIG9mIGNoaWxkIHZpZXdzLlxyXG4gKi9cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcblxyXG5cdC8vIFRoZSB3aWR0aCBvZiB0aGUgcGFuZSBjYW4gYmUgcmVzaXplZCBieSB0aGUgdXNlciwgYW5kIGlzIHBlcnNpc3RlZCB2aWFcclxuXHQvLyBsb2NhbFN0b3JhZ2VcclxuXHR2YXIgaW5zcGVjdG9yV2lkdGggPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnbmctaW5zcGVjdG9yLXdpZHRoJykgfHwgMzAwO1xyXG5cclxuXHQvLyBRdWlja2VyIHJlZmVyZW5jZSB0byBib2R5IHRocm91Z2gtb3V0IEluc3BlY3RvclBhbmUgbGV4aWNhbCBzY29wZVxyXG5cdHZhciBib2R5ID0gZG9jdW1lbnQuYm9keTtcclxuXHJcblx0Ly8gQ3JlYXRlIHRoZSByb290IERPTSBub2RlIGZvciB0aGUgaW5zcGVjdG9yIHBhbmVcclxuXHR2YXIgcGFuZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdHBhbmUuY2xhc3NOYW1lID0gJ25naS1pbnNwZWN0b3InO1xyXG5cdHBhbmUuc3R5bGUud2lkdGggPSBpbnNwZWN0b3JXaWR0aCArICdweCc7XHJcblxyXG5cdC8vIENyZWF0ZSBhbmQgZXhwb3NlIHRoZSByb290IERPTSBub2RlIGZvciB0aGUgdHJlZVZpZXdcclxuXHR0aGlzLnRyZWVWaWV3ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcblx0cGFuZS5hcHBlbmRDaGlsZCh0aGlzLnRyZWVWaWV3KTtcclxuXHJcblx0dGhpcy5hZGRWaWV3ID0gZnVuY3Rpb24odmlldykge1xyXG5cdFx0cGFuZS5hcHBlbmRDaGlsZCh2aWV3KTtcclxuXHR9O1xyXG5cclxuXHR0aGlzLmNsZWFyID0gZnVuY3Rpb24oKSB7XHJcblx0XHR3aGlsZSh0aGlzLnRyZWVWaWV3Lmxhc3RDaGlsZCkge1xyXG5cdFx0XHR0aGlzLnRyZWVWaWV3LnJlbW92ZUNoaWxkKHRoaXMudHJlZVZpZXcubGFzdENoaWxkKTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHQvLyBVc2VkIHRvIGF2b2lkIHRyYXZlcnNpbmcgb3IgaW5zcGVjdGluZyB0aGUgZXh0ZW5zaW9uIFVJXHJcblx0dGhpcy5jb250YWlucyA9IGZ1bmN0aW9uKG5vZGUpIHtcclxuXHRcdHJldHVybiB0aGlzLnRyZWVWaWV3LmNvbnRhaW5zKG5vZGUpO1xyXG5cdH07XHJcblxyXG5cdHRoaXMudmlzaWJsZSA9IGZhbHNlO1xyXG5cclxuXHQvLyBUb2dnbGUgdGhlIGluc3BlY3RvciBwYW5lIG9uIGFuZCBvZmYuIFJldHVybnMgYSBib29sZWFuIHJlcHJlc2VudGluZyB0aGVcclxuXHQvLyBuZXcgdmlzaWJpbGl0eSBzdGF0ZS5cclxuXHR0aGlzLnRvZ2dsZSA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0dmFyIGV2ZW50cyA9IHtcclxuXHRcdFx0bW91c2Vtb3ZlOiB7Zm46IG9uTW91c2VNb3ZlLCB0YXJnZXQ6IGRvY3VtZW50fSxcclxuXHRcdFx0bW91c2Vkb3duOiB7Zm46IG9uTW91c2VEb3duLCB0YXJnZXQ6IGRvY3VtZW50fSxcclxuXHRcdFx0bW91c2V1cDoge2ZuOiBvbk1vdXNlVXAsIHRhcmdldDogZG9jdW1lbnR9LFxyXG5cdFx0XHRyZXNpemU6IHtmbjogb25SZXNpemUsIHRhcmdldDogd2luZG93fVxyXG5cdFx0fTtcclxuXHJcblx0XHRpZiAoIHBhbmUucGFyZW50Tm9kZSApIHtcclxuXHRcdFx0Ym9keS5yZW1vdmVDaGlsZChwYW5lKTtcclxuXHRcdFx0dGhpcy5jbGVhcigpO1xyXG5cdFx0XHRldmVudExpc3RlbmVyQnVsayhldmVudHMsIHRydWUpO1xyXG5cdFx0XHRib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ25naS1vcGVuJyk7XHJcblx0XHRcdHJldHVybiB0aGlzLnZpc2libGUgPSBmYWxzZTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGJvZHkuYXBwZW5kQ2hpbGQocGFuZSk7XHJcblx0XHRcdGV2ZW50TGlzdGVuZXJCdWxrKGV2ZW50cywgZmFsc2UpO1xyXG5cdFx0XHRib2R5LmNsYXNzTGlzdC5hZGQoJ25naS1vcGVuJyk7XHJcblx0XHRcdHJldHVybiB0aGlzLnZpc2libGUgPSB0cnVlO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdC8vIFByZXZlbnQgc2Nyb2xsaW5nIHRoZSBwYWdlIHdoZW4gdGhlIHNjcm9sbGluZyBpbnNpZGUgdGhlIGluc3BlY3RvciBwYW5lXHJcblx0Ly8gcmVhY2hlcyB0aGUgdG9wIGFuZCBib3R0b20gbGltaXRzXHJcblx0cGFuZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXdoZWVsJywgZnVuY3Rpb24oZXZlbnQpIHtcclxuXHRcdGlmICgoZXZlbnQud2hlZWxEZWx0YVkgPiAwICYmIHBhbmUuc2Nyb2xsVG9wID09PSAwKSB8fFxyXG5cdFx0XHQoZXZlbnQud2hlZWxEZWx0YVkgPCAwICYmIChcclxuXHRcdFx0XHRwYW5lLnNjcm9sbFRvcCArIHBhbmUub2Zmc2V0SGVpZ2h0KSA9PT0gcGFuZS5zY3JvbGxIZWlnaHRcclxuXHRcdFx0KSkge1xyXG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG5cclxuXHQvLyBDYXRjaCBjbGlja3MgYXQgdGhlIHRvcCBvZiB0aGUgcGFuZSwgYW5kIHN0b3AgdGhlbSwgdG8gcHJldmVudFxyXG5cdC8vIHRyaWdnZXJpbmcgYmVoYXZpb3IgaW4gdGhlIGFwcCBiZWluZyBpbnNwZWN0ZWRcclxuXHRwYW5lLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oZXZlbnQpIHtcclxuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG5cdH0pO1xyXG5cclxuXHQvLyBTdGF0ZXMgZm9yIHRoZSBpbnNwZWN0b3IgcGFuZSByZXNpemluZyBmdW5jdGlvbmFsaXR5XHJcblx0dmFyIGlzUmVzaXppbmcgPSBmYWxzZTtcclxuXHR2YXIgY2FuUmVzaXplID0gZmFsc2U7XHJcblxyXG5cdC8vIERlZmluZXMgaG93IG1hbnkgcGl4ZWxzIHRvIHRoZSBsZWZ0IGFuZCByaWdodCBvZiB0aGUgYm9yZGVyIG9mIHRoZSBwYW5lXHJcblx0Ly8gYXJlIGNvbnNpZGVyZWQgd2l0aGluIHRoZSByZXNpemUgaGFuZGxlXHJcblx0dmFyIExFRlRfUkVTSVpFX0hBTkRMRV9QQUQgPSAzO1xyXG5cdHZhciBSSUdIVF9SRVNJWkVfSEFORExFX1BBRCA9IDI7XHJcblx0dmFyIE1JTklNVU1fV0lEVEggPSA1MDtcclxuXHR2YXIgTUFYSU1VTV9XSURUSCA9IDEwMDtcclxuXHJcblx0Ly8gTGlzdGVuIGZvciBtb3VzZW1vdmUgZXZlbnRzIGluIHRoZSBwYWdlIGJvZHksIHNldHRpbmcgdGhlIGNhblJlc2l6ZSBzdGF0ZVxyXG5cdC8vIGlmIHRoZSBtb3VzZSBob3ZlcnMgY2xvc2UgdG8gdGhlXHJcblx0ZnVuY3Rpb24gb25Nb3VzZU1vdmUoZXZlbnQpIHtcclxuXHJcblx0XHQvLyBEb24ndCBkbyBhbnl0aGluZyBpZiB0aGUgaW5zcGVjdG9yIGlzIGRldGFjaGVkIGZyb20gdGhlIERPTVxyXG5cdFx0aWYgKCFwYW5lLnBhcmVudE5vZGUpIHJldHVybjtcclxuXHJcblx0XHQvLyBDaGVjayBpZiB0aGUgbW91c2UgY3Vyc29yIGlzIGN1cnJlbnRseSBob3ZlcmluZyB0aGUgcmVzaXplIGhhbmRsZSxcclxuXHRcdC8vIGNvbnNpc3Rpbmcgb2YgdGhlIHZlcnRpY2FsIHBpeGVsIGNvbHVtbiBvZiB0aGUgaW5zcGVjdG9yIGJvcmRlciBwbHVzXHJcblx0XHQvLyBhIHBhZCBvZiBwaXhlbCBjb2x1bW5zIHRvIHRoZSBsZWZ0IGFuZCByaWdodC4gVGhlIGNsYXNzIGFkZGVkIHRvXHJcblx0XHQvLyB0aGUgcGFnZSBib2R5IGlzIHVzZWQgZm9yIHN0eWxpbmcgdGhlIGN1cnNvciB0byBgY29sLXJlc2l6ZWBcclxuXHRcdGlmIChwYW5lLm9mZnNldExlZnQgLSBMRUZUX1JFU0laRV9IQU5ETEVfUEFEIDw9IGV2ZW50LmNsaWVudFggJiZcclxuXHRcdFx0ZXZlbnQuY2xpZW50WCA8PSBwYW5lLm9mZnNldExlZnQgKyBSSUdIVF9SRVNJWkVfSEFORExFX1BBRCkge1xyXG5cdFx0XHRjYW5SZXNpemUgPSB0cnVlO1xyXG5cdFx0XHRib2R5LmNsYXNzTGlzdC5hZGQoJ25naS1yZXNpemUnKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGNhblJlc2l6ZSA9IGZhbHNlO1xyXG5cdFx0XHRib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ25naS1yZXNpemUnKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBJZiB0aGUgdXNlciBpcyBjdXJyZW50bHkgcGVyZm9ybWluZyBhIHJlc2l6ZSwgdGhlIHdpZHRoIGlzIGFkanVzdGVkXHJcblx0XHQvLyBiYXNlZCBvbiB0aGUgY3Vyc29yIHBvc2l0aW9uXHJcblx0XHRpZiAoaXNSZXNpemluZykge1xyXG5cclxuXHRcdFx0dmFyIHdpZHRoID0gKHdpbmRvdy5pbm5lcldpZHRoIC0gZXZlbnQuY2xpZW50WCk7XHJcblxyXG5cdFx0XHQvLyBFbmZvcmNlIG1pbmltdW0gYW5kIG1heGltdW0gbGltaXRzXHJcblx0XHRcdGlmICh3aWR0aCA+PSB3aW5kb3cuaW5uZXJXaWR0aCAtIE1JTklNVU1fV0lEVEgpIHtcclxuXHRcdFx0XHR3aWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoIC0gTUlOSU1VTV9XSURUSDtcclxuXHRcdFx0fSBlbHNlIGlmICh3aWR0aCA8PSBNQVhJTVVNX1dJRFRIKSB7XHJcblx0XHRcdFx0d2lkdGggPSBNQVhJTVVNX1dJRFRIO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRwYW5lLnN0eWxlLndpZHRoID0gd2lkdGggKyAncHgnO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Ly8gTGlzdGVuIHRvIG1vdXNlZG93biBldmVudHMgaW4gdGhlIHBhZ2UgYm9keSwgdHJpZ2dlcmluZyB0aGUgcmVzaXplIG1vZGVcclxuXHQvLyAoaXNSZXNpemluZykgaWYgdGhlIGN1cnNvciBpcyB3aXRoaW4gdGhlIHJlc2l6ZSBoYW5kbGUgKGNhblJlc2l6ZSkuIFRoZVxyXG5cdC8vIGNsYXNzIGFkZGVkIHRvIHRoZSBwYWdlIGJvZHkgc3R5bGVzIGl0IHRvIGRpc2FibGUgdGV4dCBzZWxlY3Rpb24gd2hpbGUgdGhlXHJcblx0Ly8gdXNlciBkcmFnZ2luZyB0aGUgbW91c2UgdG8gcmVzaXplIHRoZSBwYW5lXHJcblx0ZnVuY3Rpb24gb25Nb3VzZURvd24oKSB7XHJcblx0XHRpZiAoY2FuUmVzaXplKSB7XHJcblx0XHRcdGlzUmVzaXppbmcgPSB0cnVlO1xyXG5cdFx0XHRib2R5LmNsYXNzTGlzdC5hZGQoJ25naS1yZXNpemluZycpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblxyXG5cdC8vIExpc3RlbiB0byBtb3VzZXVwIGV2ZW50cyBvbiB0aGUgcGFnZSwgdHVybmluZyBvZmYgdGhlIHJlc2l6ZSBtb2RlIGlmIG9uZVxyXG5cdC8vIGlzIHVuZGVyd2F5LiBUaGUgaW5zcGVjdG9yIHdpZHRoIGlzIHRoZW4gcGVyc2lzdGVkIGluIHRoZSBsb2NhbFN0b3JhZ2VcclxuXHRmdW5jdGlvbiBvbk1vdXNlVXAoKSB7XHJcblx0XHRpZiAoaXNSZXNpemluZykge1xyXG5cdFx0XHRpc1Jlc2l6aW5nID0gZmFsc2U7XHJcblx0XHRcdGJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbmdpLXJlc2l6aW5nJyk7XHJcblx0XHRcdGxvY2FsU3RvcmFnZS5zZXRJdGVtKCduZy1pbnNwZWN0b3Itd2lkdGgnLCBwYW5lLm9mZnNldFdpZHRoKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdC8vIElmIHRoZSB1c2VyIGNvbnRyYWN0cyB0aGUgd2luZG93LCB0aGlzIG1ha2VzIHN1cmUgdGhlIHBhbmUgd29uJ3QgZW5kIHVwXHJcblx0Ly8gd2lkZXIgdGhhbnQgdGhlIHZpZXdwb3J0XHJcblx0ZnVuY3Rpb24gb25SZXNpemUoKSB7XHJcblx0XHRpZiAocGFuZS5vZmZzZXRXaWR0aCA+PSBib2R5Lm9mZnNldFdpZHRoIC0gTUlOSU1VTV9XSURUSCkge1xyXG5cdFx0XHRwYW5lLnN0eWxlLndpZHRoID0gKGJvZHkub2Zmc2V0V2lkdGggLSBNSU5JTVVNX1dJRFRIKSArICdweCc7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvLyBDYW4gcGVyZm9ybSBhIG1hcHBpbmcgb2YgZXZlbnRzL2Z1bmN0aW9ucyB0byBhZGRFdmVudExpc3RlbmVyXHJcblx0Ly8gb3IgcmVtb3ZlRXZlbnRMaXN0ZW5lciwgdG8gcHJldmVudCBjb2RlIGR1cGxpY2F0aW9uIHdoZW4gYnVsayBhZGRpbmcvcmVtb3ZpbmdcclxuXHRmdW5jdGlvbiBldmVudExpc3RlbmVyQnVsayhldmVudHNPYmosIHJlbW92ZSkge1xyXG5cdFx0dmFyIGV2ZW50TGlzdGVuZXJGdW5jID0gcmVtb3ZlID8gJ3JlbW92ZUV2ZW50TGlzdGVuZXInIDogJ2FkZEV2ZW50TGlzdGVuZXInO1xyXG5cdFx0T2JqZWN0LmtleXMoZXZlbnRzT2JqKS5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XHJcblx0XHRcdGV2ZW50c09ialtldmVudF0udGFyZ2V0W2V2ZW50TGlzdGVuZXJGdW5jXShldmVudCwgZXZlbnRzT2JqW2V2ZW50XS5mbik7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG59OyIsInZhciBOR0kgPSB7XHJcblx0VHJlZVZpZXc6IHJlcXVpcmUoJy4vVHJlZVZpZXcnKSxcclxuXHRNb2RlbE1peGluOiByZXF1aXJlKCcuL01vZGVsTWl4aW4nKSxcclxuXHRVdGlsczogcmVxdWlyZSgnLi9VdGlscycpXHJcbn07XHJcblxyXG5mdW5jdGlvbiBNb2RlbChrZXksIHZhbHVlLCBkZXB0aCkge1xyXG5cclxuXHR0aGlzLmtleSA9IGtleTtcclxuXHR0aGlzLnZhbHVlID0gdmFsdWU7XHJcblx0dGhpcy5uZ2lUeXBlID0gJ01vZGVsJztcclxuXHJcblx0Ly9UT0RPIGNoZWNrIGZvciBtZW1vcnkgbGVha3NcclxuXHR0aGlzLnZpZXcgPSBOR0kuVHJlZVZpZXcubW9kZWxJdGVtKHRoaXMsIGRlcHRoKTtcclxuXHJcblx0dmFyIHZhbFNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblx0dmFsU3Bhbi5jbGFzc05hbWUgPSAnbmdpLXZhbHVlJztcclxuXHJcblx0TkdJLk1vZGVsTWl4aW4uZXh0ZW5kKHRoaXMpO1xyXG5cclxuXHR0aGlzLnNldFZhbHVlID0gZnVuY3Rpb24obmV3VmFsdWUpIHtcclxuXHJcblx0XHR0aGlzLnZhbHVlID0gdmFsdWUgPSBuZXdWYWx1ZTtcclxuXHJcblx0XHQvLyBTdHJpbmdcclxuXHRcdGlmIChhbmd1bGFyLmlzU3RyaW5nKHZhbHVlKSkge1xyXG5cdFx0XHR0aGlzLnZpZXcuc2V0VHlwZSgnbmdpLW1vZGVsLXN0cmluZycpO1xyXG5cdFx0XHRpZiAodmFsdWUudHJpbSgpLmxlbmd0aCA+IDI1KSB7XHJcblx0XHRcdFx0dmFsU3Bhbi50ZXh0Q29udGVudCA9ICdcIicgKyB2YWx1ZS50cmltKCkuc3Vic3RyKDAsIDI1KSArICcgKC4uLilcIic7XHJcblx0XHRcdFx0dGhpcy52aWV3LnNldEluZGljYXRvcih2YWx1ZS5sZW5ndGgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAnXCInICsgdmFsdWUudHJpbSgpICsgJ1wiJztcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdC8vIEZ1bmN0aW9uXHJcblx0XHRlbHNlIGlmIChhbmd1bGFyLmlzRnVuY3Rpb24odmFsdWUpKSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtZnVuY3Rpb24nKTtcclxuXHRcdFx0dmFyIGFyZ3MgPSBOR0kuVXRpbHMuYW5ub3RhdGUodmFsdWUpLmpvaW4oJywgJyk7XHJcblx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAnZnVuY3Rpb24oJyArIGFyZ3MgKyAnKSB7Li4ufSc7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gQ2lyY3VsYXJcclxuXHRcdGVsc2UgaWYgKGRlcHRoLmluZGV4T2YodmFsdWUpID49IDApIHtcclxuXHRcdFx0dGhpcy52aWV3LnNldFR5cGUoJ25naS1tb2RlbC1jaXJjdWxhcicpO1xyXG5cdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJ2NpcmN1bGFyIHJlZmVyZW5jZSc7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gTlVMTFxyXG5cdFx0ZWxzZSBpZiAodmFsdWUgPT09IG51bGwpIHtcclxuXHRcdFx0dGhpcy52aWV3LnNldFR5cGUoJ25naS1tb2RlbC1udWxsJyk7XHJcblx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAnbnVsbCc7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gQXJyYXlcclxuXHRcdGVsc2UgaWYgKGFuZ3VsYXIuaXNBcnJheSh2YWx1ZSkpIHtcclxuXHRcdFx0dGhpcy52aWV3LnNldFR5cGUoJ25naS1tb2RlbC1hcnJheScpO1xyXG5cdFx0XHR2YXIgbGVuZ3RoID0gdmFsdWUubGVuZ3RoO1xyXG5cdFx0XHRpZiAobGVuZ3RoID09PSAwKSB7XHJcblx0XHRcdFx0dmFsU3Bhbi50ZXh0Q29udGVudCA9ICdbIF0nO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAnWy4uLl0nO1xyXG5cdFx0XHRcdHRoaXMudmlldy5zZXRJbmRpY2F0b3IobGVuZ3RoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLnZpZXcubWFrZUNvbGxhcHNpYmxlKHRydWUsIHRydWUpO1xyXG5cdFx0XHR0aGlzLnVwZGF0ZSh2YWx1ZSwgZGVwdGguY29uY2F0KFt0aGlzLnZhbHVlXSksIE1vZGVsKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBET00gRWxlbWVudFxyXG5cdFx0ZWxzZSBpZiAoYW5ndWxhci5pc0VsZW1lbnQodmFsdWUpKSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtZWxlbWVudCcpO1xyXG5cdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJzwnICsgdmFsdWUudGFnTmFtZSArICc+JztcclxuXHRcdH1cclxuXHJcblx0XHQvLyBPYmplY3RcclxuXHRcdGVsc2UgaWYgKGFuZ3VsYXIuaXNPYmplY3QodmFsdWUpKSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtb2JqZWN0Jyk7XHJcblx0XHRcdHZhciBsZW5ndGggPSBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoO1xyXG5cdFx0XHRpZiAobGVuZ3RoID09PSAwKSB7XHJcblx0XHRcdFx0dmFsU3Bhbi50ZXh0Q29udGVudCA9ICd7IH0nO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAney4uLn0nO1xyXG5cdFx0XHRcdHRoaXMudmlldy5zZXRJbmRpY2F0b3IobGVuZ3RoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLnZpZXcubWFrZUNvbGxhcHNpYmxlKHRydWUsIHRydWUpO1xyXG5cdFx0XHR0aGlzLnVwZGF0ZSh2YWx1ZSwgZGVwdGguY29uY2F0KFt0aGlzLnZhbHVlXSksIE1vZGVsKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBCb29sZWFuXHJcblx0XHRlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xyXG5cdFx0XHR0aGlzLnZpZXcuc2V0VHlwZSgnbmdpLW1vZGVsLWJvb2xlYW4nKTtcclxuXHRcdFx0dmFsU3Bhbi50ZXh0Q29udGVudCA9IHZhbHVlO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIE51bWJlclxyXG5cdFx0ZWxzZSBpZiAoYW5ndWxhci5pc051bWJlcih2YWx1ZSkpIHtcclxuXHRcdFx0dGhpcy52aWV3LnNldFR5cGUoJ25naS1tb2RlbC1udW1iZXInKTtcclxuXHRcdFx0dmFsU3Bhbi50ZXh0Q29udGVudCA9IHZhbHVlO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIFVuZGVmaW5lZFxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtdW5kZWZpbmVkJyk7XHJcblx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAndW5kZWZpbmVkJztcclxuXHRcdH1cclxuXHJcblx0fTtcclxuXHR0aGlzLnNldFZhbHVlKHZhbHVlKTtcclxuXHJcblx0dGhpcy52aWV3LmxhYmVsLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcgJykpO1xyXG5cdHRoaXMudmlldy5sYWJlbC5hcHBlbmRDaGlsZCh2YWxTcGFuKTtcclxufVxyXG5cclxuTW9kZWwuaW5zdGFuY2UgPSBmdW5jdGlvbihrZXksIHZhbHVlLCBkZXB0aCkge1xyXG5cdHJldHVybiBuZXcgTW9kZWwoa2V5LCB2YWx1ZSwgZGVwdGgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNb2RlbDtcclxuIiwiZnVuY3Rpb24gZ2V0VXNlckRlZmluZWRLZXlzKHZhbHVlcykge1xyXG5cdHJldHVybiBPYmplY3Qua2V5cyh2YWx1ZXMpLmZpbHRlcihmdW5jdGlvbihrZXkpIHtcclxuXHRcdHJldHVybiAhaXNQcml2YXRlQW5ndWxhclByb3Aoa2V5KTtcclxuXHR9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNQcml2YXRlQW5ndWxhclByb3AocHJvcE5hbWUpIHtcclxuXHR2YXIgUFJJVkFURV9LRVlfQkxBQ0tMSVNUID0gWyckcGFyZW50JywgJyRyb290JywgJyRpZCddO1xyXG5cdHZhciBBTkdVTEFSX1BSSVZBVEVfUFJFRklYID0gJyQkJztcclxuXHR2YXIgZmlyc3RUd29DaGFycyA9IHByb3BOYW1lWzBdICsgcHJvcE5hbWVbMV07XHJcblxyXG5cdGlmIChmaXJzdFR3b0NoYXJzID09PSBBTkdVTEFSX1BSSVZBVEVfUFJFRklYKSByZXR1cm4gdHJ1ZTtcclxuXHRpZiAoUFJJVkFURV9LRVlfQkxBQ0tMSVNULmluZGV4T2YocHJvcE5hbWUpID4gLTEgfHwgcHJvcE5hbWUgPT09ICd0aGlzJykgcmV0dXJuIHRydWU7XHJcblx0cmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhcnJheURpZmYoYSwgYikge1xyXG5cdHZhciBpLCByZXQgPSB7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGV4aXN0aW5nOiBbXSB9O1xyXG5cclxuXHQvLyBJdGVyYXRlIHRocm91Z2ggYiBjaGVja2luZyBmb3IgYWRkZWQgYW5kIGV4aXN0aW5nIGVsZW1lbnRzXHJcblx0Zm9yIChpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcclxuXHRcdGlmIChhLmluZGV4T2YoYltpXSkgPCAwKSB7XHJcblx0XHRcdHJldC5hZGRlZC5wdXNoKGJbaV0pO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cmV0LmV4aXN0aW5nLnB1c2goYltpXSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvLyBJdGVyYXRlIHRocm91Z2ggYSBjaGVja2luZyBmb3IgcmVtb3ZlZCBlbGVtZW50c1xyXG5cdGZvciAoaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRpZiAoYi5pbmRleE9mKGFbaV0pIDwgMCkge1xyXG5cdFx0XHRyZXQucmVtb3ZlZC5wdXNoKGFbaV0pO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmV0dXJuIHJldDtcclxufVxyXG5cclxuZnVuY3Rpb24gTW9kZWxNaXhpbigpIHt9XHJcblxyXG5Nb2RlbE1peGluLnVwZGF0ZSA9IGZ1bmN0aW9uKHZhbHVlcywgZGVwdGgsIE1vZGVsKSB7XHJcblxyXG5cdGlmICh0eXBlb2YgdGhpcy5tb2RlbE9ianMgPT09ICd1bmRlZmluZWQnKSB0aGlzLm1vZGVsT2JqcyA9IHt9O1xyXG5cdGlmICh0eXBlb2YgdGhpcy5tb2RlbEtleXMgPT09ICd1bmRlZmluZWQnKSB0aGlzLm1vZGVsS2V5cyA9IFtdO1xyXG5cclxuXHR2YXIgbmV3S2V5cyA9IGdldFVzZXJEZWZpbmVkS2V5cyh2YWx1ZXMpLFxyXG5cdFx0XHRkaWZmID0gYXJyYXlEaWZmKHRoaXMubW9kZWxLZXlzLCBuZXdLZXlzKSxcclxuXHRcdFx0aSwga2V5O1xyXG5cclxuXHQvLyBSZW1vdmVkIGtleXNcclxuXHRmb3IgKGkgPSAwOyBpIDwgZGlmZi5yZW1vdmVkLmxlbmd0aDsgaSsrKSB7XHJcblx0XHR2YXIga2V5ID0gZGlmZi5yZW1vdmVkW2ldO1xyXG5cdFx0dGhpcy5tb2RlbE9ianNba2V5XS52aWV3LmRlc3Ryb3koKTtcclxuXHRcdGRlbGV0ZSB0aGlzLm1vZGVsT2Jqc1trZXldO1xyXG5cdH1cclxuXHRcclxuXHQvLyBOZXcga2V5c1xyXG5cdGZvciAoaSA9IDA7IGkgPCBkaWZmLmFkZGVkLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRrZXkgPSBkaWZmLmFkZGVkW2ldO1xyXG5cdFx0dGhpcy5tb2RlbE9ianNba2V5XSA9IE1vZGVsLmluc3RhbmNlKGtleSwgdmFsdWVzW2tleV0sIGRlcHRoLmNvbmNhdChbdmFsdWVzXSkpO1xyXG5cdFx0dmFyIGluc2VydEF0VG9wID0gdGhpcy5uZ2lUeXBlID09PSAnU2NvcGUnO1xyXG5cdFx0dGhpcy52aWV3LmFkZENoaWxkKHRoaXMubW9kZWxPYmpzW2tleV0udmlldywgaW5zZXJ0QXRUb3ApO1xyXG5cdH1cclxuXHJcblx0Ly8gVXBkYXRlZCBrZXlzXHJcblx0Zm9yIChpID0gMDsgaSA8IGRpZmYuZXhpc3RpbmcubGVuZ3RoOyBpKyspIHtcclxuXHRcdGtleSA9IGRpZmYuZXhpc3RpbmdbaV07XHJcblx0XHRpZiAoIXRoaXMubW9kZWxPYmpzW2tleV0pIHtcclxuXHRcdFx0dmFyIGluc3QgPSB0aGlzLm5naVR5cGUgPT09ICdTY29wZScgPyAnU2NvcGUnIDogdGhpcy5uZ2lUeXBlID09PSAnTW9kZWwnID8gJ01vZGVsJyA6ICdVTktOT1dOIElOU1RBTkNFJztcclxuXHRcdFx0Y29udGludWU7XHJcblx0XHR9XHJcblx0XHR0aGlzLm1vZGVsT2Jqc1trZXldLnNldFZhbHVlKHZhbHVlc1trZXldKTtcclxuXHR9XHJcblxyXG5cdHRoaXMubW9kZWxLZXlzID0gbmV3S2V5cztcclxufTtcclxuXHJcbk1vZGVsTWl4aW4uZXh0ZW5kID0gZnVuY3Rpb24ob2JqKSB7XHJcblx0b2JqLnVwZGF0ZSA9IE1vZGVsTWl4aW4udXBkYXRlLmJpbmQob2JqKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTW9kZWxNaXhpbjtcclxuIiwidmFyIE5HSSA9IHtcclxuXHRTZXJ2aWNlOiByZXF1aXJlKCcuL1NlcnZpY2UnKVxyXG59O1xyXG5cclxuZnVuY3Rpb24gTW9kdWxlKGFwcCwgbmFtZSkge1xyXG5cclxuXHQvLyBUaGUgQW5ndWxhckpTIG1vZHVsZSBuYW1lXHJcblx0dGhpcy5uYW1lID0gbmFtZTtcclxuXHJcblx0Ly8gQXJyYXkgd2l0aCBgTkdJLk1vZHVsZWAgaW5zdGFuY2UgcmVmZXJlbmNlc1xyXG5cdHRoaXMucmVxdWlyZXMgPSBbXTtcclxuXHJcblx0Ly8gVGhlIEFuZ3VsYXJKUyBtb2R1bGUgaW5zdGFuY2VcclxuXHR0aGlzLm5nTW9kdWxlID0gd2luZG93LmFuZ3VsYXIubW9kdWxlKG5hbWUpO1xyXG5cclxuXHQvLyBgTkdJLlNlcnZpY2VgIGluc3RhbmNlcyByZXByZXNlbnRpbmcgc2VydmljZXMgZGVmaW5lZCBpbiB0aGlzIG1vZHVsZVxyXG5cdHRoaXMuc2VydmljZXMgPSBOR0kuU2VydmljZS5wYXJzZVF1ZXVlKGFwcCwgdGhpcy5uZ01vZHVsZSk7XHJcbn1cclxuXHJcbi8vIEEgY2FjaGUgd2l0aCBhbGwgTkdJLk1vZHVsZSBpbnN0YW5jZXNcclxudmFyIG1vZHVsZUNhY2hlID0gW107XHJcblxyXG5Nb2R1bGUucmVnaXN0ZXIgPSBmdW5jdGlvbihhcHAsIG5hbWUpIHtcclxuXHQvLyBFbnN1cmUgb25seSBhIHNpbmdsZSBgTkdJLk1vZHVsZWAgaW5zdGFuY2UgZXhpc3RzIGZvciBlYWNoIEFuZ3VsYXJKU1xyXG5cdC8vIG1vZHVsZSBuYW1lXHJcblx0aWYgKHR5cGVvZiBuYW1lID09PSB0eXBlb2YgJycgJiYgIW1vZHVsZUNhY2hlW25hbWVdKSB7XHJcblx0XHRtb2R1bGVDYWNoZVtuYW1lXSA9IG5ldyBNb2R1bGUoYXBwLCBuYW1lKTtcclxuXHJcblx0XHQvLyBSZWdpc3RlciB0aGUgZGVwZW5kZW5jaWVzXHJcblx0XHR2YXIgcmVxdWlyZXMgPSBtb2R1bGVDYWNoZVtuYW1lXS5uZ01vZHVsZS5yZXF1aXJlcztcclxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgcmVxdWlyZXMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0dmFyIGRlcGVuZGVuY3kgPSBNb2R1bGUucmVnaXN0ZXIoYXBwLCByZXF1aXJlc1tpXSk7XHJcblx0XHRcdG1vZHVsZUNhY2hlW25hbWVdLnJlcXVpcmVzLnB1c2goZGVwZW5kZW5jeSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gbW9kdWxlQ2FjaGVbbmFtZV07XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE1vZHVsZTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjb21tYW5kLCBwYXlsb2FkLCBvcmlnaW4pIHtcclxuICAgIHZhciBtc2cgPSBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgY29tbWFuZDogY29tbWFuZCxcclxuICAgICAgICBwYXlsb2FkOiBwYXlsb2FkXHJcbiAgICB9KTtcclxuICAgIHdpbmRvdy5wb3N0TWVzc2FnZShtc2csIG9yaWdpbiB8fCAnKicpO1xyXG59OyIsInZhciBOR0kgPSB7XHJcblx0VHJlZVZpZXc6IHJlcXVpcmUoJy4vVHJlZVZpZXcnKSxcclxuXHRNb2RlbE1peGluOiByZXF1aXJlKCcuL01vZGVsTWl4aW4nKSxcclxuXHRJbnNwZWN0b3JBZ2VudDogcmVxdWlyZSgnLi9JbnNwZWN0b3JBZ2VudCcpLFxyXG5cdE1vZGVsOiByZXF1aXJlKCcuL01vZGVsJylcclxufTtcclxuXHJcbmZ1bmN0aW9uIFNjb3BlKGFwcCwgbmdTY29wZSwgaXNJc29sYXRlKSB7XHJcblxyXG5cdHZhciBhbmd1bGFyID0gd2luZG93LmFuZ3VsYXI7XHJcblxyXG5cdHRoaXMuYXBwID0gYXBwO1xyXG5cdHRoaXMubmdTY29wZSA9IG5nU2NvcGU7XHJcblx0dGhpcy5uZ2lUeXBlID0gJ1Njb3BlJztcclxuXHJcblx0Ly8gQ2FsY3VsYXRlIHRoZSBzY29wZSBkZXB0aCBpbiB0aGUgdHJlZSB0byBkZXRlcm1pbmUgdGhlIGludGVuZGF0aW9uIGxldmVsXHJcblx0Ly8gaW4gdGhlIFRyZWVWaWV3XHJcblx0dmFyIHJlZmVyZW5jZSA9IG5nU2NvcGU7XHJcblx0dmFyIGRlcHRoID0gW3JlZmVyZW5jZV07XHJcblx0d2hpbGUgKHJlZmVyZW5jZSA9IHJlZmVyZW5jZS4kcGFyZW50KSB7IGRlcHRoLnB1c2gocmVmZXJlbmNlKTsgfVxyXG5cclxuXHQvLyBJbnN0YW50aWF0ZSBhbmQgZXhwb3NlIHRoZSBUcmVlVmlld0l0ZW0gcmVwcmVzZW50aW5nIHRoZSBzY29wZVxyXG5cdHZhciB2aWV3ID0gdGhpcy52aWV3ID0gTkdJLlRyZWVWaWV3LnNjb3BlSXRlbShuZ1Njb3BlLiRpZCwgZGVwdGgsIGlzSXNvbGF0ZSk7XHJcblx0aWYgKGlzSXNvbGF0ZSkgdGhpcy52aWV3LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbmdpLWlzb2xhdGUtc2NvcGUnKTtcclxuXHJcblx0Ly8gQ2FsbGVkIHdoZW4gdGhlIGBOR0kuSW5zcGVjdG9yQWdlbnRgIERPTSB0cmF2ZXJzYWwgZmluZHMgYSBOb2RlIG1hdGNoXHJcblx0Ly8gZm9yIHRoZSBzY29wZVxyXG5cdHRoaXMuc2V0Tm9kZSA9IGZ1bmN0aW9uKG5vZGUpIHtcclxuXHRcdHRoaXMubm9kZSA9IHRoaXMudmlldy5ub2RlID0gbm9kZTtcclxuXHR9O1xyXG5cclxuXHRmdW5jdGlvbiBjaGlsZFNjb3BlSWRzKCkge1xyXG5cdFx0aWYgKCFuZ1Njb3BlLiQkY2hpbGRIZWFkKSByZXR1cm4gW107XHJcblx0XHR2YXIgY2hpbGRLZXlzID0gW107XHJcblx0XHR2YXIgY2hpbGRTY29wZSA9IG5nU2NvcGUuJCRjaGlsZEhlYWQ7XHJcblx0XHRkbyB7XHJcblx0XHRcdGNoaWxkS2V5cy5wdXNoKGNoaWxkU2NvcGUuJGlkKTtcclxuXHRcdH0gd2hpbGUgKGNoaWxkU2NvcGUgPSBjaGlsZFNjb3BlLiQkbmV4dFNpYmxpbmcpO1xyXG5cdFx0cmV0dXJuIGNoaWxkS2V5cztcclxuXHR9XHJcblxyXG5cdHZhciBvbGRDaGlsZElkcyA9IGNoaWxkU2NvcGVJZHMoKTtcclxuXHJcblx0dmFyIGRlc3Ryb3lEZXJlZ2lzdGVyID0gYW5ndWxhci5ub29wO1xyXG5cdHZhciB3YXRjaERlcmVnaXN0ZXIgPSBhbmd1bGFyLm5vb3A7XHJcblx0dmFyIG9ic2VydmVyT24gPSBmYWxzZTtcclxuXHJcblx0TkdJLk1vZGVsTWl4aW4uZXh0ZW5kKHRoaXMpO1xyXG5cdHRoaXMudXBkYXRlKG5nU2NvcGUsIGRlcHRoLCBOR0kuTW9kZWwpO1xyXG5cclxuXHR0aGlzLnN0YXJ0T2JzZXJ2ZXIgPSBmdW5jdGlvbigpIHtcclxuXHRcdGlmIChvYnNlcnZlck9uID09PSBmYWxzZSkge1xyXG5cdFx0XHR2YXIgc2NvcGVPYmogPSB0aGlzO1xyXG5cdFx0XHRkZXN0cm95RGVyZWdpc3RlciA9IG5nU2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdHZpZXcuZGVzdHJveSgpO1xyXG5cdFx0XHR9KTtcclxuXHRcdFx0d2F0Y2hEZXJlZ2lzdGVyID0gbmdTY29wZS4kd2F0Y2goZnVuY3Rpb24oKSB7XHJcblxyXG5cdFx0XHRcdC8vIFNjb3BlczogYmFzaWMgY2hlY2sgZm9yIG11dGF0aW9ucyBpbiB0aGUgZGlyZWN0IGNoaWxkIHNjb3BlIGxpc3RcclxuXHRcdFx0XHR2YXIgbmV3Q2hpbGRJZHMgPSBjaGlsZFNjb3BlSWRzKCk7XHJcblx0XHRcdFx0aWYgKCFhbmd1bGFyLmVxdWFscyhvbGRDaGlsZElkcywgbmV3Q2hpbGRJZHMpKSB7XHJcblx0XHRcdFx0XHROR0kuSW5zcGVjdG9yQWdlbnQuaW5zcGVjdFNjb3BlKGFwcCwgbmdTY29wZSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdG9sZENoaWxkSWRzID0gbmV3Q2hpbGRJZHM7XHJcblxyXG5cdFx0XHRcdC8vIE1vZGVsc1xyXG5cdFx0XHRcdHNjb3BlT2JqLnVwZGF0ZShuZ1Njb3BlLCBkZXB0aCwgTkdJLk1vZGVsKTtcclxuXHJcblx0XHRcdH0pO1xyXG5cdFx0XHRvYnNlcnZlck9uID0gdHJ1ZTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHR0aGlzLnN0b3BPYnNlcnZlciA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0aWYgKG9ic2VydmVyT24gPT09IHRydWUpIHtcclxuXHRcdFx0aWYgKHR5cGVvZiBkZXN0cm95RGVyZWdpc3RlciA9PT0gJ2Z1bmN0aW9uJykge1xyXG5cdFx0XHRcdGRlc3Ryb3lEZXJlZ2lzdGVyLmFwcGx5KCk7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKHR5cGVvZiB3YXRjaERlcmVnaXN0ZXIgPT09ICdmdW5jdGlvbicpIHtcclxuXHRcdFx0XHR3YXRjaERlcmVnaXN0ZXIuYXBwbHkoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRvYnNlcnZlck9uID0gZmFsc2U7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcbn1cclxuXHJcbi8vIFRvIGVhc2lseSByZXRyaWV2ZSBhbiBgTkdJLlNjb3BlYCBpbnN0YW5jZSBieSB0aGUgc2NvcGUgaWQsIHdlIGtlZXAgYVxyXG4vLyBjYWNoZSBvZiBjcmVhdGVkIGluc3RhbmNlc1xyXG52YXIgc2NvcGVDYWNoZSA9IHt9O1xyXG5cclxuLy8gRXhwb3NlIHN0b3BPYnNlcnZlcnMgdG8gc3RvcCBvYnNlcnZlcnMgZnJvbSBhbGwgc2NvcGVzIGluIGBzY29wZUNhY2hlYCB3aGVuXHJcbi8vIHRoZSBpbnNwZWN0b3IgcGFuZSBpcyB0b2dnbGVkIG9mZlxyXG5TY29wZS5zdG9wT2JzZXJ2ZXJzID0gZnVuY3Rpb24oKSB7XHJcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBzY29wZUNhY2hlLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRzY29wZUNhY2hlW2ldLnN0b3BPYnNlcnZlcigpO1xyXG5cdH1cclxufTtcclxuXHJcbi8vIFJldHVybnMgYW4gaW5zdGFuY2Ugb2YgYE5HSS5TY29wZWAgcmVwcmVzZW50aW5nIHRoZSBBbmd1bGFySlMgc2NvcGUgd2l0aFxyXG4vLyB0aGUgaWRcclxuU2NvcGUuZ2V0ID0gZnVuY3Rpb24oaWQpIHtcclxuXHRyZXR1cm4gc2NvcGVDYWNoZVtpZF07XHJcbn07XHJcblxyXG4vLyBUaGlzIGlzIHRoZSBtZXRob2QgdXNlZCBieSBgTkdJLkluc3BlY3RvckFnZW50YCB0byBpbnN0YW50aWF0ZSB0aGVcclxuLy8gYE5HSS5TY29wZWAgb2JqZWN0XHJcblNjb3BlLmluc3RhbmNlID0gZnVuY3Rpb24oYXBwLCBuZ1Njb3BlLCBpc0lzb2xhdGUpIHtcclxuXHRpZiAoc2NvcGVDYWNoZVtuZ1Njb3BlLiRpZF0pIHtcclxuXHRcdHJldHVybiBzY29wZUNhY2hlW25nU2NvcGUuJGlkXTtcclxuXHR9XHJcblx0dmFyIHNjb3BlID0gbmV3IFNjb3BlKGFwcCwgbmdTY29wZSwgaXNJc29sYXRlKTtcclxuXHRzY29wZUNhY2hlW25nU2NvcGUuJGlkXSA9IHNjb3BlO1xyXG5cdHJldHVybiBzY29wZTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2NvcGU7XHJcbiIsInZhciBOR0kgPSB7XHJcblx0VXRpbHM6IHJlcXVpcmUoJy4vVXRpbHMnKVxyXG59O1xyXG5cclxudmFyIENMQVNTX0RJUkVDVElWRV9SRUdFWFAgPSAvKChbXFxkXFx3XFwtX10rKSg/OlxcOihbXjtdKykpPzs/KS87XHJcblxyXG5mdW5jdGlvbiBTZXJ2aWNlKGFwcCwgbW9kdWxlLCBpbnZva2UpIHtcclxuXHR0aGlzLnByb3ZpZGVyID0gaW52b2tlWzBdO1xyXG5cdHRoaXMudHlwZSA9IGludm9rZVsxXTtcclxuXHR0aGlzLmRlZmluaXRpb24gPSBpbnZva2VbMl07XHJcblx0dGhpcy5uYW1lID0gKHR5cGVvZiB0aGlzLmRlZmluaXRpb25bMF0gPT09IHR5cGVvZiAnJykgPyB0aGlzLmRlZmluaXRpb25bMF0gOiBudWxsO1xyXG5cdHRoaXMuZmFjdG9yeSA9IHRoaXMuZGVmaW5pdGlvblsxXTtcclxuXHRcclxuXHRzd2l0Y2godGhpcy5wcm92aWRlcikge1xyXG5cdFx0Y2FzZSAnJGNvbXBpbGVQcm92aWRlcic6XHJcblxyXG5cdFx0XHR2YXIgZGlyO1xyXG5cclxuXHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRkaXIgPSBhcHAuJGluamVjdG9yLmludm9rZSh0aGlzLmZhY3RvcnkpO1xyXG5cdFx0XHR9IGNhdGNoKGVycikge1xyXG5cdFx0XHRcdHJldHVybiBjb25zb2xlLndhcm4oXHJcblx0XHRcdFx0XHQnbmctaW5zcGVjdG9yOiBBbiBlcnJvciBvY2N1cnJlZCBhdHRlbXB0aW5nIHRvIGludm9rZSBkaXJlY3RpdmU6ICcgK1xyXG5cdFx0XHRcdFx0KHRoaXMubmFtZSB8fCAnKHVua25vd24pJyksXHJcblx0XHRcdFx0XHRlcnJcclxuXHRcdFx0XHQpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAoIWRpcikgZGlyID0ge307XHJcblx0XHRcdHZhciByZXN0cmljdCA9IGRpci5yZXN0cmljdCB8fCAnQUUnO1xyXG5cdFx0XHR2YXIgbmFtZSA9IHRoaXMubmFtZTtcclxuXHJcblx0XHRcdGFwcC5yZWdpc3RlclByb2JlKGZ1bmN0aW9uKG5vZGUsIHNjb3BlLCBpc0lzb2xhdGUpIHtcclxuXHJcblx0XHRcdFx0aWYgKG5vZGUgPT09IGRvY3VtZW50KSB7XHJcblx0XHRcdFx0XHRub2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2h0bWwnKVswXTtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdC8vIFRlc3QgZm9yIEF0dHJpYnV0ZSBDb21tZW50IGRpcmVjdGl2ZXMgKHdpdGggcmVwbGFjZTp0cnVlIGZvciB0aGVcclxuXHRcdFx0XHQvLyBsYXR0ZXIpXHJcblx0XHRcdFx0aWYgKHJlc3RyaWN0LmluZGV4T2YoJ0EnKSA+IC0xIHx8XHJcblx0XHRcdFx0XHQoZGlyLnJlcGxhY2UgPT09IHRydWUgJiYgcmVzdHJpY3QuaW5kZXhPZignTScpID4gLTEpKSB7XHJcblx0XHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG5vZGUuYXR0cmlidXRlcy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRcdFx0XHR2YXIgbm9ybWFsaXplZCA9IE5HSS5VdGlscy5kaXJlY3RpdmVOb3JtYWxpemUobm9kZS5hdHRyaWJ1dGVzW2ldLm5hbWUpO1xyXG5cdFx0XHRcdFx0XHRpZiAobm9ybWFsaXplZCA9PT0gbmFtZSkge1xyXG5cdFx0XHRcdFx0XHRcdGlmICghaXNJc29sYXRlICYmIGRpci5zY29wZSA9PT0gdHJ1ZSB8fFxyXG5cdFx0XHRcdFx0XHRcdFx0aXNJc29sYXRlICYmIHR5cGVvZiBkaXIuc2NvcGUgPT09IHR5cGVvZiB7fSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0c2NvcGUudmlldy5hZGRBbm5vdGF0aW9uKG5hbWUsIFNlcnZpY2UuRElSKTtcclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdC8vIFRlc3QgZm9yIEVsZW1lbnQgZGlyZWN0aXZlc1xyXG5cdFx0XHRcdGlmIChyZXN0cmljdC5pbmRleE9mKCdFJykgPiAtMSkge1xyXG5cdFx0XHRcdFx0dmFyIG5vcm1hbGl6ZWQgPSBOR0kuVXRpbHMuZGlyZWN0aXZlTm9ybWFsaXplKG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcclxuXHRcdFx0XHRcdGlmIChub3JtYWxpemVkID09PSBuYW1lKSB7XHJcblx0XHRcdFx0XHRcdGlmICghaXNJc29sYXRlICYmIGRpci5zY29wZSA9PT0gdHJ1ZSB8fFxyXG5cdFx0XHRcdFx0XHRcdGlzSXNvbGF0ZSAmJiB0eXBlb2YgZGlyLnNjb3BlID09PSB0eXBlb2Yge30pIHtcclxuXHRcdFx0XHRcdFx0XHRzY29wZS52aWV3LmFkZEFubm90YXRpb24obmFtZSwgU2VydmljZS5ESVIpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQvLyBUZXN0IGZvciBDbGFzcyBkaXJlY3RpdmVzXHJcblx0XHRcdFx0aWYgKHJlc3RyaWN0LmluZGV4T2YoJ0MnKSA+IC0xKSB7XHJcblx0XHRcdFx0XHR2YXIgbWF0Y2hlcyA9IENMQVNTX0RJUkVDVElWRV9SRUdFWFAuZXhlYyhub2RlLmNsYXNzTmFtZSk7XHJcblx0XHRcdFx0XHRpZiAobWF0Y2hlcykge1xyXG5cdFx0XHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG1hdGNoZXMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0XHRcdFx0XHRpZiAoIW1hdGNoZXNbaV0pIGNvbnRpbnVlO1xyXG5cdFx0XHRcdFx0XHRcdHZhciBub3JtYWxpemVkID0gTkdJLlV0aWxzLmRpcmVjdGl2ZU5vcm1hbGl6ZShtYXRjaGVzW2ldKTtcclxuXHRcdFx0XHRcdFx0XHRpZiAobm9ybWFsaXplZCA9PT0gbmFtZSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFpc0lzb2xhdGUgJiYgZGlyLnNjb3BlID09PSB0cnVlIHx8XHJcblx0XHRcdFx0XHRcdFx0XHRcdGlzSXNvbGF0ZSAmJiB0eXBlb2YgZGlyLnNjb3BlID09PSB0eXBlb2Yge30pIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0c2NvcGUudmlldy5hZGRBbm5vdGF0aW9uKG5hbWUsIFNlcnZpY2UuRElSKTtcclxuXHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHR9KTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlICckY29udHJvbGxlclByb3ZpZGVyJzpcclxuXHJcblx0XHRcdGFwcC5yZWdpc3RlclByb2JlKGZ1bmN0aW9uKG5vZGUsIHNjb3BlKSB7XHJcblxyXG5cdFx0XHRcdGlmIChub2RlID09PSBkb2N1bWVudCkge1xyXG5cdFx0XHRcdFx0bm9kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdodG1sJylbMF07XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQvLyBUZXN0IGZvciB0aGUgcHJlc2VuY2Ugb2YgdGhlIG5nQ29udHJvbGxlciBkaXJlY3RpdmVcclxuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG5vZGUuYXR0cmlidXRlcy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRcdFx0dmFyIG5vcm1hbGl6ZWQgPSBOR0kuVXRpbHMuZGlyZWN0aXZlTm9ybWFsaXplKG5vZGUuYXR0cmlidXRlc1tpXS5uYW1lKTtcclxuXHRcdFx0XHRcdGlmIChub3JtYWxpemVkID09PSAnbmdDb250cm9sbGVyJykge1xyXG5cdFx0XHRcdFx0XHRzY29wZS52aWV3LmFkZEFubm90YXRpb24obm9kZS5hdHRyaWJ1dGVzW2ldLnZhbHVlLCBTZXJ2aWNlLkNUUkwpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0YnJlYWs7XHJcblx0fVxyXG59XHJcblxyXG5TZXJ2aWNlLkNUUkwgPSAxO1xyXG5TZXJ2aWNlLkRJUiA9IDI7XHJcblNlcnZpY2UuQlVJTFRJTiA9IDQ7XHJcblxyXG5TZXJ2aWNlLnBhcnNlUXVldWUgPSBmdW5jdGlvbihhcHAsIG1vZHVsZSkge1xyXG5cdHZhciBhcnIgPSBbXSxcclxuXHRcdFx0cXVldWUgPSBtb2R1bGUuX2ludm9rZVF1ZXVlLFxyXG5cdFx0XHR0ZW1wUXVldWUsIGksIGo7XHJcblx0Zm9yIChpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRpZiAocXVldWVbaV1bMl0ubGVuZ3RoID09PSAxICYmICEocXVldWVbaV1bMl1bMF0gaW5zdGFuY2VvZiBBcnJheSkpIHtcclxuXHRcdFx0Zm9yIChqIGluIHF1ZXVlW2ldWzJdWzBdKSB7XHJcblx0XHRcdFx0aWYgKE9iamVjdC5oYXNPd25Qcm9wZXJ0eS5jYWxsKHF1ZXVlW2ldWzJdWzBdLCBqKSkge1xyXG5cdFx0XHRcdFx0dGVtcFF1ZXVlID0gcXVldWVbaV0uc2xpY2UoKTtcclxuXHRcdFx0XHRcdHRlbXBRdWV1ZVsyXSA9IFtPYmplY3Qua2V5cyhxdWV1ZVtpXVsyXVswXSlbal0sIHF1ZXVlW2ldWzJdWzBdW2pdXTtcclxuXHRcdFx0XHRcdGFyci5wdXNoKG5ldyBTZXJ2aWNlKGFwcCwgbW9kdWxlLCB0ZW1wUXVldWUpKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGFyci5wdXNoKG5ldyBTZXJ2aWNlKGFwcCwgbW9kdWxlLCBxdWV1ZVtpXSkpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRyZXR1cm4gYXJyO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTZXJ2aWNlO1xyXG4iLCJ2YXIgTkdJID0ge1xyXG5cdFNlcnZpY2U6IHJlcXVpcmUoJy4vU2VydmljZScpLFxyXG5cdEhpZ2hsaWdodGVyOiByZXF1aXJlKCcuL0hpZ2hsaWdodGVyJylcclxufTtcclxuXHJcbmZ1bmN0aW9uIFRyZWVWaWV3SXRlbShsYWJlbCkge1xyXG5cclxuXHR0aGlzLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuXHJcblx0Ly8gU3RvcmUgcmVmZXJlbmNlIHRvIGl0c2VsZi4gTmVlZGVkIGZvciBkZWxlZ2F0ZWQgbW91c2VvdmVyXHJcblx0dGhpcy5lbGVtZW50Lml0ZW0gPSB0aGlzO1xyXG5cclxuXHQvLyBBY2NlcHRzIGEgbGFiZWwgRE9NIE5vZGUgb3IgYSBzdHJpbmdcclxuXHRpZiAodHlwZW9mIGxhYmVsID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgbGFiZWwgPT09ICdudW1iZXInKSB7XHJcblx0XHR0aGlzLmxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGFiZWwnKTtcclxuXHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSBsYWJlbDtcclxuXHR9IGVsc2UgaWYgKCEhbGFiZWwudGFnTmFtZSkge1xyXG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xyXG5cdH1cclxuXHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5sYWJlbCk7XHJcblxyXG5cdHRoaXMuZHJhd2VyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcblx0dGhpcy5kcmF3ZXIuY2xhc3NOYW1lID0gJ25naS1kcmF3ZXInO1xyXG5cdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLmRyYXdlcik7XHJcblxyXG5cdHRoaXMuY2FyZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblx0dGhpcy5jYXJldC5jbGFzc05hbWUgPSAnbmdpLWNhcmV0JztcclxuXHJcblx0dGhpcy5sZW5ndGggPSBudWxsO1xyXG5cclxuXHR2YXIgY29sbGFwc2VkID0gZmFsc2U7XHJcblx0dGhpcy5zZXRDb2xsYXBzZWQgPSBmdW5jdGlvbihuZXdTdGF0ZSkge1xyXG5cdFx0aWYgKGNvbGxhcHNlZCA9IG5ld1N0YXRlKSB7XHJcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCduZ2ktY29sbGFwc2VkJyk7XHJcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCduZ2ktZXhwYW5kZWQnKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCduZ2ktY29sbGFwc2VkJyk7XHJcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCduZ2ktZXhwYW5kZWQnKTtcclxuXHRcdH1cclxuXHR9O1xyXG5cdHRoaXMudG9nZ2xlID0gZnVuY3Rpb24oZSkge1xyXG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuXHRcdHRoaXMuc2V0Q29sbGFwc2VkKCFjb2xsYXBzZWQpO1xyXG5cdH07XHJcblx0dGhpcy5jYXJldC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMudG9nZ2xlLmJpbmQodGhpcykpO1xyXG5cclxuXHR2YXIgaXNDb2xsYXBzaWJsZSA9IGZhbHNlO1xyXG5cdHRoaXMubWFrZUNvbGxhcHNpYmxlID0gZnVuY3Rpb24oY29sbGFwc2libGVTdGF0ZSwgaW5pdGlhbFN0YXRlKSB7XHJcblx0XHRpZiAoaXNDb2xsYXBzaWJsZSA9PSBjb2xsYXBzaWJsZVN0YXRlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmIChpc0NvbGxhcHNpYmxlID0gY29sbGFwc2libGVTdGF0ZSkge1xyXG5cdFx0XHR0aGlzLmxhYmVsLmFwcGVuZENoaWxkKHRoaXMuY2FyZXQpO1xyXG5cdFx0XHR0aGlzLnNldENvbGxhcHNlZChpbml0aWFsU3RhdGUgfHwgZmFsc2UpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5sYWJlbC5yZW1vdmVDaGlsZCh0aGlzLmNhcmV0KTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHR0aGlzLmFkZENoaWxkID0gZnVuY3Rpb24oY2hpbGRJdGVtLCB0b3ApIHtcclxuXHRcdGlmICghIXRvcCkge1xyXG5cdFx0XHR0aGlzLmRyYXdlci5pbnNlcnRCZWZvcmUoY2hpbGRJdGVtLmVsZW1lbnQsIHRoaXMuZHJhd2VyLmZpcnN0Q2hpbGQpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5kcmF3ZXIuYXBwZW5kQ2hpbGQoY2hpbGRJdGVtLmVsZW1lbnQpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdHRoaXMucmVtb3ZlQ2hpbGRyZW4gPSBmdW5jdGlvbihjbGFzc05hbWUpIHtcclxuXHRcdGZvciAodmFyIGkgPSB0aGlzLmRyYXdlci5jaGlsZE5vZGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcblx0XHRcdHZhciBjaGlsZCA9IHRoaXMuZHJhd2VyLmNoaWxkTm9kZXNbaV07XHJcblx0XHRcdGlmIChjaGlsZC5jbGFzc0xpc3QuY29udGFpbnMoY2xhc3NOYW1lKSkge1xyXG5cdFx0XHRcdHRoaXMuZHJhd2VyLnJlbW92ZUNoaWxkKGNoaWxkKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0aWYgKHRoaXMuZWxlbWVudC5wYXJlbnROb2RlKSB7XHJcblx0XHRcdHRoaXMuZWxlbWVudC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWxlbWVudCk7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0Ly8gUGlsbCBpbmRpY2F0b3JcclxuXHR2YXIgaW5kaWNhdG9yID0gZmFsc2U7XHJcblx0dGhpcy5zZXRJbmRpY2F0b3IgPSBmdW5jdGlvbih2YWx1ZSkge1xyXG5cdFx0aWYgKGluZGljYXRvciAmJiB0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInICYmIHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcclxuXHRcdFx0aW5kaWNhdG9yLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoaW5kaWNhdG9yKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGlmICghaW5kaWNhdG9yKSB7XHJcblx0XHRcdFx0aW5kaWNhdG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cdFx0XHRcdGluZGljYXRvci5jbGFzc05hbWUgPSAnbmdpLWluZGljYXRvcic7XHJcblx0XHRcdFx0aW5kaWNhdG9yLnRleHRDb250ZW50ID0gdmFsdWU7XHJcblx0XHRcdFx0dGhpcy5sYWJlbC5hcHBlbmRDaGlsZChpbmRpY2F0b3IpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0Ly8gQW5ub3RhdGlvbnMgKGNvbnRyb2xsZXIgbmFtZXMsIGN1c3RvbSBhbmQgYnVpbHQtaW4gZGlyZWN0aXZlIG5hbWVzKVxyXG5cdHZhciBhbm5vdGF0aW9ucyA9IFtdO1xyXG5cdHRoaXMuYWRkQW5ub3RhdGlvbiA9IGZ1bmN0aW9uKG5hbWUsIHR5cGUpIHtcclxuXHRcdGlmIChhbm5vdGF0aW9ucy5pbmRleE9mKG5hbWUpIDwgMCkge1xyXG5cdFx0XHRhbm5vdGF0aW9ucy5wdXNoKG5hbWUpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dmFyIHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblx0XHRzcGFuLmNsYXNzTmFtZSA9ICduZ2ktYW5ub3RhdGlvbic7XHJcblx0XHRzcGFuLnRleHRDb250ZW50ID0gbmFtZTtcclxuXHRcdHN3aXRjaCh0eXBlKSB7XHJcblx0XHRcdGNhc2UgTkdJLlNlcnZpY2UuRElSOlxyXG5cdFx0XHRcdHNwYW4uY2xhc3NMaXN0LmFkZCgnbmdpLWFubm90YXRpb24tZGlyJyk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdGNhc2UgTkdJLlNlcnZpY2UuQlVJTFRJTjpcclxuXHRcdFx0XHRzcGFuLmNsYXNzTGlzdC5hZGQoJ25naS1hbm5vdGF0aW9uLWJ1aWx0aW4nKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0Y2FzZSBOR0kuU2VydmljZS5DVFJMOlxyXG5cdFx0XHRcdHNwYW4uY2xhc3NMaXN0LmFkZCgnbmdpLWFubm90YXRpb24tY3RybCcpO1xyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5sYWJlbC5hcHBlbmRDaGlsZChzcGFuKTtcclxuXHR9O1xyXG5cclxuXHQvLyBNb2RlbCB0eXBlc1xyXG5cdHZhciB0eXBlID0gbnVsbDtcclxuXHR0aGlzLnNldFR5cGUgPSBmdW5jdGlvbihuZXdUeXBlKSB7XHJcblx0XHRpZiAodHlwZSkge1xyXG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSh0eXBlKTtcclxuXHRcdH1cclxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKG5ld1R5cGUpO1xyXG5cdFx0dHlwZSA9IG5ld1R5cGU7XHJcblx0fTtcclxuXHJcbn1cclxuXHJcbmZ1bmN0aW9uIFRyZWVWaWV3KCkge31cclxuXHJcbi8vIENyZWF0ZXMgYSBUcmVlVmlld0l0ZW0gaW5zdGFuY2UsIHdpdGggc3R5bGluZyBhbmQgbWV0YWRhdGEgcmVsZXZhbnQgZm9yXHJcbi8vIEFuZ3VsYXJKUyBhcHBzXHJcblRyZWVWaWV3LmFwcEl0ZW0gPSBmdW5jdGlvbihsYWJlbCwgbm9kZSkge1xyXG5cdGlmIChub2RlID09PSBkb2N1bWVudCkgbm9kZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2h0bWwnKTtcclxuXHR2YXIgaXRlbSA9IG5ldyBUcmVlVmlld0l0ZW0obGFiZWwpO1xyXG5cdGl0ZW0ubm9kZSA9IG5vZGU7XHJcblx0aXRlbS5lbGVtZW50LmNsYXNzTmFtZSA9ICduZ2ktYXBwJztcclxuXHJcblx0Ly8gSGlnaGxpZ2h0IERPTSBlbGVtZW50cyB0aGUgc2NvcGUgaXMgYXR0YWNoZWQgdG8gd2hlbiBob3ZlcmluZyB0aGUgaXRlbVxyXG5cdC8vIGluIHRoZSBpbnNwZWN0b3JcclxuXHRpdGVtLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgZnVuY3Rpb24oZXZlbnQpIHtcclxuXHRcdGlmKGV2ZW50LnRhcmdldC5ub2RlTmFtZSA9PT0gJ0xBQkVMJyAmJiBldmVudC50YXJnZXQucGFyZW50Tm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ25naS1zY29wZScpKSB7XHJcblx0XHRcdC8vIERvIG5vdCBhZGQgYSBsYXllciB3aGVuIG1vdXNlIGNvbWVzIGZyb20gbmdpLWFubm90YXRpb25cclxuXHRcdFx0aWYgKGV2ZW50LnJlbGF0ZWRUYXJnZXQgJiYgZXZlbnQucmVsYXRlZFRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ25naS1hbm5vdGF0aW9uJykpIHJldHVybiBmYWxzZTtcclxuXHJcblx0XHRcdHZhciBpdGVtID0gZXZlbnQudGFyZ2V0LnBhcmVudE5vZGUuaXRlbTtcclxuXHRcdFx0aWYgKCBpdGVtLm5vZGUgJiYgIXdpbmRvdy5uZ0luc3BlY3Rvci5wYW5lLmlzUmVzaXppbmcpIHtcclxuXHRcdFx0XHR2YXIgdGFyZ2V0ID0gKGl0ZW0ubm9kZSA9PT0gZG9jdW1lbnQpID9cclxuXHRcdFx0XHRcdGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2h0bWwnKSA6IGl0ZW0ubm9kZTtcclxuXHRcdFx0XHQvLyB0YXJnZXQuY2xhc3NMaXN0LmFkZCgnbmdpLWhpZ2hsaWdodCcpO1xyXG5cdFx0XHRcdE5HSS5IaWdobGlnaHRlci5obCh0YXJnZXQpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSk7XHJcblx0aXRlbS5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgZnVuY3Rpb24oZXZlbnQpIHtcclxuXHRcdGlmKGV2ZW50LnRhcmdldC5ub2RlTmFtZSA9PT0gJ0xBQkVMJyAmJiBldmVudC50YXJnZXQucGFyZW50Tm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ25naS1zY29wZScpKSB7XHJcblx0XHRcdC8vIERvIG5vdCByZW1vdmUgdGhlIGxheWVyIHdoZW4gbW91c2UgbGVhdmVzIGZvciBuZ2ktYW5ub3RhdGlvblxyXG5cdFx0XHRpZiAoZXZlbnQucmVsYXRlZFRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ25naS1hbm5vdGF0aW9uJykpIHJldHVybiBmYWxzZTtcclxuXHJcblx0XHRcdHZhciBpdGVtID0gZXZlbnQudGFyZ2V0LnBhcmVudE5vZGUuaXRlbTtcclxuXHRcdFx0aWYgKGl0ZW0ubm9kZSkge1xyXG5cdFx0XHRcdE5HSS5IaWdobGlnaHRlci5jbGVhcigpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSk7XHJcblxyXG4gICAgcmV0dXJuIGl0ZW07XHJcbn07XHJcblxyXG4vLyBDcmVhdGVzIGEgVHJlZVZpZXdJdGVtIGluc3RhbmNlLCB3aXRoIHN0eWxpbmcgYW5kIG1ldGFkYXRhIHJlbGV2YW50IGZvclxyXG4vLyBBbmd1bGFySlMgc2NvcGVzXHJcblRyZWVWaWV3LnNjb3BlSXRlbSA9IGZ1bmN0aW9uKGxhYmVsLCBkZXB0aCwgaXNJc29sYXRlKSB7XHJcblx0dmFyIGl0ZW0gPSBuZXcgVHJlZVZpZXdJdGVtKGxhYmVsKTtcclxuXHRpdGVtLmVsZW1lbnQuY2xhc3NOYW1lID0gJ25naS1zY29wZSc7XHJcblx0aXRlbS5tYWtlQ29sbGFwc2libGUodHJ1ZSwgZmFsc2UpO1xyXG5cdGlmIChpc0lzb2xhdGUpIHtcclxuXHRcdGl0ZW0uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCduZ2ktaXNvbGF0ZS1zY29wZScpO1xyXG5cdH1cclxuXHRpdGVtLmxhYmVsLmNsYXNzTmFtZSA9ICduZ2ktZGVwdGgtJyArIGRlcHRoLmxlbmd0aDtcclxuXHJcblx0Ly8gY29uc29sZS5sb2cgdGhlIERPTSBOb2RlIHRoaXMgc2NvcGUgaXMgYXR0YWNoZWQgdG9cclxuXHRpdGVtLmxhYmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKSB7XHJcblx0XHRjb25zb2xlLmxvZyhpdGVtLm5vZGUpO1xyXG5cdH0pO1xyXG5cclxuXHRyZXR1cm4gaXRlbTtcclxufTtcclxuXHJcbi8vIENyZWF0ZXMgYSBUcmVlVmlld0l0ZW0gaW5zdGFuY2UsIHdpdGggc3R5bGluZyBhbmQgbWV0YWRhdGEgcmVsZXZhbnQgZm9yXHJcbi8vIEFuZ3VsYXJKUyBtb2RlbHNcclxuVHJlZVZpZXcubW9kZWxJdGVtID0gZnVuY3Rpb24obW9kZWxJbnN0YW5jZSwgZGVwdGgpIHtcclxuXHR2YXIgaXRlbSA9IG5ldyBUcmVlVmlld0l0ZW0obW9kZWxJbnN0YW5jZS5rZXkgKyAnOicpO1xyXG5cdGl0ZW0uZWxlbWVudC5jbGFzc05hbWUgPSAnbmdpLW1vZGVsJztcclxuXHRpdGVtLmxhYmVsLmNsYXNzTmFtZSA9ICduZ2ktZGVwdGgtJyArIGRlcHRoLmxlbmd0aDtcclxuXHJcblx0aXRlbS5sYWJlbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uKCkge1xyXG5cdFx0Y29uc29sZS5pbmZvKG1vZGVsSW5zdGFuY2UudmFsdWUpO1xyXG5cdH0pO1xyXG5cclxuXHRyZXR1cm4gaXRlbTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gVHJlZVZpZXc7IiwidmFyIFV0aWxzID0ge307XHJcblxyXG52YXIgU1BFQ0lBTF9DSEFSU19SRUdFWFAgPSAvKFtcXDpcXC1cXF9dKyguKSkvZztcclxudmFyIE1PWl9IQUNLX1JFR0VYUCA9IC9ebW96KFtBLVpdKS87XHJcblxyXG4vKipcclxuICogQ29udmVydHMgc25ha2VfY2FzZSB0byBjYW1lbENhc2UuXHJcbiAqIEFsc28gYSBzcGVjaWFsIGNhc2UgZm9yIE1veiBwcmVmaXggc3RhcnRpbmcgd2l0aCB1cHBlciBjYXNlIGxldHRlci5cclxuICovXHJcblV0aWxzLmNhbWVsQ2FzZSA9IGZ1bmN0aW9uKG5hbWUpIHtcclxuXHRyZXR1cm4gbmFtZS5cclxuXHRcdHJlcGxhY2UoU1BFQ0lBTF9DSEFSU19SRUdFWFAsIGZ1bmN0aW9uKF8sIHNlcGFyYXRvciwgbGV0dGVyLCBvZmZzZXQpIHtcclxuXHRcdFx0cmV0dXJuIG9mZnNldCA/IGxldHRlci50b1VwcGVyQ2FzZSgpIDogbGV0dGVyO1xyXG5cdFx0fSkuXHJcblx0XHRyZXBsYWNlKE1PWl9IQUNLX1JFR0VYUCwgJ01veiQxJyk7XHJcbn1cclxuXHJcbnZhciBGTl9BUkdTID0gL15mdW5jdGlvblxccypbXlxcKF0qXFwoXFxzKihbXlxcKV0qKVxcKS9tO1xyXG52YXIgRk5fQVJHX1NQTElUID0gLywvO1xyXG52YXIgRk5fQVJHID0gL15cXHMqKF8/KShcXFMrPylcXDFcXHMqJC87XHJcbnZhciBTVFJJUF9DT01NRU5UUyA9IC8oKFxcL1xcLy4qJCl8KFxcL1xcKltcXHNcXFNdKj9cXCpcXC8pKS9tZztcclxuXHJcbnZhciBQUkVGSVhfUkVHRVhQID0gL14oeFtcXDpcXC1fXXxkYXRhW1xcOlxcLV9dKS9pO1xyXG4vKipcclxuICogQ29udmVydHMgYWxsIGFjY2VwdGVkIGRpcmVjdGl2ZXMgZm9ybWF0IGludG8gcHJvcGVyIGRpcmVjdGl2ZSBuYW1lLlxyXG4gKiBBbGwgb2YgdGhlc2Ugd2lsbCBiZWNvbWUgJ215RGlyZWN0aXZlJzpcclxuICogICBteTpEaXJlY3RpdmVcclxuICogICBteS1kaXJlY3RpdmVcclxuICogICB4LW15LWRpcmVjdGl2ZVxyXG4gKiAgIGRhdGEtbXk6ZGlyZWN0aXZlXHJcbiAqL1xyXG5VdGlscy5kaXJlY3RpdmVOb3JtYWxpemUgPSBmdW5jdGlvbihuYW1lKSB7XHJcblx0cmV0dXJuIFV0aWxzLmNhbWVsQ2FzZShuYW1lLnJlcGxhY2UoUFJFRklYX1JFR0VYUCwgJycpKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlY2VpdmVzIGEgc2VydmljZSBmYWN0b3J5IGFuZCByZXR1cm5zIGFuIGluamVjdGlvbiB0b2tlbi4gT25seSB1c2VkIGluXHJcbiAqIG9sZGVyIHZlcnNpb25zIG9mIEFuZ3VsYXJKUyB0aGF0IGRpZCBub3QgZXhwb3NlIGAuYW5ub3RhdGVgXHJcbiAqXHJcbiAqIEFkYXB0ZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9hbmd1bGFyLmpzL2Jsb2IvMGJhYTE3YTNiN2FkMmIyNDJkZjJiMjc3YjgxY2ViZGY3NWIwNDI4Ny9zcmMvYXV0by9pbmplY3Rvci5qc1xyXG4gKiovXHJcblV0aWxzLmFubm90YXRlID0gZnVuY3Rpb24oZm4pIHtcclxuXHR2YXIgJGluamVjdCwgZm5UZXh0LCBhcmdEZWNsO1xyXG5cclxuXHRpZiAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XHJcblx0XHRpZiAoISgkaW5qZWN0ID0gZm4uJGluamVjdCkpIHtcclxuXHRcdFx0JGluamVjdCA9IFtdO1xyXG5cdFx0XHRpZiAoZm4ubGVuZ3RoKSB7XHJcblx0XHRcdFx0Zm5UZXh0ID0gZm4udG9TdHJpbmcoKS5yZXBsYWNlKFNUUklQX0NPTU1FTlRTLCAnJyk7XHJcblx0XHRcdFx0YXJnRGVjbCA9IGZuVGV4dC5tYXRjaChGTl9BUkdTKTtcclxuXHRcdFx0XHRpZihhcmdEZWNsICYmIGFyZ0RlY2xbMV0pe1xyXG5cdFx0XHRcdFx0dmFyIGFyZ0RlY2xzID0gYXJnRGVjbFsxXS5zcGxpdChGTl9BUkdfU1BMSVQpO1xyXG5cdFx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBhcmdEZWNscy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRcdFx0XHR2YXIgYXJnID0gYXJnRGVjbHNbaV07XHJcblx0XHRcdFx0XHRcdGFyZy5yZXBsYWNlKEZOX0FSRywgZnVuY3Rpb24oYWxsLCB1bmRlcnNjb3JlLCBuYW1lKSB7XHJcblx0XHRcdFx0XHRcdFx0JGluamVjdC5wdXNoKG5hbWUpO1xyXG5cdFx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdH07XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHRcdGZuLiRpbmplY3QgPSAkaW5qZWN0O1xyXG5cdFx0fVxyXG5cdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmbikpIHtcclxuXHRcdCRpbmplY3QgPSBmbi5zbGljZSgwLCBmbi5sZW5ndGggLSAxKTtcclxuXHR9IGVsc2Uge1xyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuICRpbmplY3Q7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7XHJcbiIsInZhciBOR0kgPSB7XHJcblx0SW5zcGVjdG9yOiByZXF1aXJlKCcuL0luc3BlY3RvcicpLFxyXG5cdEFwcDogcmVxdWlyZSgnLi9BcHAnKSxcclxuXHRQdWJsaXNoRXZlbnQ6IHJlcXVpcmUoJy4vUHVibGlzaEV2ZW50JylcclxufTtcclxuXHJcbnZhciBfYW5ndWxhcjtcclxudmFyIF9ib290c3RyYXA7XHJcblxyXG5cclxuLy8gV3JhcCBBbmd1bGFyIHByb3BlcnR5IChwcmlvciB0byBiZWluZyBkZWZpbmVkIGJ5IGFuZ3VsYXIgaXRzZWxmKVxyXG4vLyBzbyB3ZSBjYW4gYmUgbm90aWZpZWQgd2hlbiBBbmd1bGFyIGlzIHByZXNlbnQgb24gdGhlIHBhZ2UsIHdpdGhvdXRcclxuLy8gaGF2aW5nIHRvIHJlc29ydCB0byBwb2xsaW5nXHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3aW5kb3csICdhbmd1bGFyJywge1xyXG5cdC8vIGVudW1lcmFibGU6IGZhbHNlIHRvIHByZXZlbnQgb3RoZXIgZXh0ZW5zaW9ucyAoV0FwcGFseXplciwgZm9yIGV4YW1wbGUpXHJcblx0Ly8gZnJvbSB0aGlua2luZyBhbmd1bGFyIGlzIHByZXNlbnQgYnkgY2hlY2tpbmcgXCJpZiAoYW5ndWxhciBpbiB3aW5kb3cpXCJcclxuXHRlbnVtZXJhYmxlOiBmYWxzZSxcclxuXHRjb25maWd1cmFibGU6IHRydWUsXHJcblx0Z2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIF9hbmd1bGFyOyB9LFxyXG5cdHNldDogZnVuY3Rpb24odmFsKSB7XHJcblx0XHRfYW5ndWxhciA9IHZhbDtcclxuXHRcdHdyYXBCb290c3RyYXAoKTtcclxuXHRcdC8vIE5vdyB0aGF0IEFuZ3VsYXIgaXMgcHJlc2VudCBvbiB0aGUgcGFnZSwgYWxsb3cgdGhlIHByb3BlcnR5IHRvIGJlXHJcblx0XHQvLyB2aXNpYmxlIHRocm91Z2ggcmVmbGVjdGlvblxyXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHdpbmRvdywgJ2FuZ3VsYXInLCB7IGVudW1lcmFibGU6IHRydWUgfSk7XHJcblx0XHROR0kuUHVibGlzaEV2ZW50KCduZ2ktYW5ndWxhci1mb3VuZCcpO1xyXG5cdH1cclxufSk7XHJcblxyXG5mdW5jdGlvbiB3cmFwQm9vdHN0cmFwKCkge1xyXG5cdC8vIEhvb2sgQW5ndWxhcidzIG1hbnVhbCBib290c3RyYXBwaW5nIG1lY2hhbmlzbSB0byBjYXRjaCBhcHBsaWNhdGlvbnNcclxuXHQvLyB0aGF0IGRvIG5vdCB1c2UgdGhlIFwibmctYXBwXCIgZGlyZWN0aXZlXHJcblx0aWYgKF9hbmd1bGFyLmhhc093blByb3BlcnR5KCdib290c3RyYXAnKSkgcmV0dXJuO1xyXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShfYW5ndWxhciwgJ2Jvb3RzdHJhcCcsIHtcclxuXHRcdGdldDogZnVuY3Rpb24oKSB7XHJcblx0XHRcdC8vIFJldHVybiBmYWxzZXkgdmFsIHdoZW4gYW5ndWxhciBoYXNuJ3QgYXNzaWduZWQgaXQncyBvd24gYm9vdHN0cmFwXHJcblx0XHRcdC8vIHByb3AgeWV0LCBvciB3aWxsIGdldCB3YXJuaW5nIGFib3V0IG11bHRpcGxlIGFuZ3VsYXIgdmVyc2lvbnMgbG9hZGVkXHJcblx0XHRcdHJldHVybiBfYm9vdHN0cmFwID8gbW9kaWZpZWRCb290c3RyYXAgOiBudWxsO1xyXG5cdFx0fSxcclxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XHJcblx0XHRcdF9ib290c3RyYXAgPSB2YWw7XHJcblx0XHR9XHJcblx0fSk7XHJcbn1cclxuXHJcbnZhciBtb2RpZmllZEJvb3RzdHJhcCA9IGZ1bmN0aW9uKG5vZGUsIG1vZHVsZXMpIHtcclxuXHQvLyBVc2VkIHRvIG1vbmtleS1wYXRjaCBvdmVyIGFuZ3VsYXIuYm9vdHN0cmFwLCB0byBhbGxvdyB0aGUgZXh0ZW5zaW9uXHJcblx0Ly8gdG8gYmUgbm90aWZpZWQgd2hlbiBhIG1hbnVhbGx5LWJvb3RzdHJhcHBlZCBhcHAgaGFzIGJlZW4gZm91bmQuIE5lY2Vzc2FyeVxyXG5cdC8vIHNpbmNlIHdlIGNhbid0IGZpbmQgdGhlIGFwcGxpY2F0aW9uIGJ5IHRyYXZlcnNpbmcgdGhlIERPTSBsb29raW5nIGZvciBuZy1hcHBcclxuXHRpbml0aWFsaXplSW5zcGVjdG9yKCk7XHJcblxyXG5cdC8vIENvbnRpbnVlIHdpdGggYW5ndWxhcidzIG5hdGl2ZSBib290c3RyYXAgbWV0aG9kXHJcblx0dmFyIHJldCA9IF9ib290c3RyYXAuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxuXHJcblx0Ly8gVW53cmFwIGlmIGpRdWVyeSBvciBqcUxpdGUgZWxlbWVudFxyXG5cdGlmIChub2RlLmpxdWVyeSB8fCBub2RlLmluamVjdG9yKSBub2RlID0gbm9kZVswXTtcclxuXHJcblx0TkdJLkFwcC5ib290c3RyYXAobm9kZSwgbW9kdWxlcyk7XHJcblxyXG5cdHJldHVybiByZXQ7XHJcbn07XHJcblxyXG4vLyBBdHRlbXB0IHRvIGluaXRpYWxpemUgaW5zcGVjdG9yIGF0IHRoZSBzYW1lIHRpbWUgQW5ndWxhcidzIG5nLWFwcCBkaXJlY3RpdmVcclxuLy8ga2lja3Mgb2ZmLiBJZiBhbmd1bGFyIGlzbid0IGZvdW5kIGF0IHRoaXMgcG9pbnQsIGl0IGhhcyB0byBiZSBhIG1hbnVhbGx5XHJcbi8vIGJvb3RzdHJhcHBlZCBhcHBcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGluaXRpYWxpemVJbnNwZWN0b3IpO1xyXG5cclxuZnVuY3Rpb24gaW5pdGlhbGl6ZUluc3BlY3RvcigpIHtcclxuXHRpZiAoX2FuZ3VsYXIgJiYgIXdpbmRvdy5uZ0luc3BlY3Rvcikge1xyXG5cdFx0d2luZG93Lm5nSW5zcGVjdG9yID0gbmV3IE5HSS5JbnNwZWN0b3IoKTtcclxuXHR9XHJcbn1cclxuXHJcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2ZW50KSB7XHJcblx0aWYgKGV2ZW50Lm9yaWdpbiAhPT0gd2luZG93LmxvY2F0aW9uLm9yaWdpbikgcmV0dXJuO1xyXG5cclxuXHR2YXIgZXZlbnREYXRhID0gZXZlbnQuZGF0YTtcclxuXHRpZiAoIWV2ZW50RGF0YSB8fCB0eXBlb2YgZXZlbnREYXRhICE9PSAnc3RyaW5nJykgcmV0dXJuO1xyXG5cdHRyeSB7XHJcblx0XHRldmVudERhdGEgPSBKU09OLnBhcnNlKGV2ZW50RGF0YSk7XHJcblx0fSBjYXRjaChlKSB7XHJcblx0XHQvLyBOb3QgYSBKU09OIG9iamVjdC4gVHlwaWNhbGx5IG1lYW5zIGFub3RoZXIgc2NyaXB0IG9uIHRoZSBwYWdlXHJcblx0XHQvLyBpcyB1c2luZyBwb3N0TWVzc2FnZS4gU2FmZSB0byBpZ25vcmVcclxuXHR9XHJcblxyXG5cdGlmIChldmVudERhdGEuY29tbWFuZCA9PT0gJ25naS10b2dnbGUnKSB7XHJcblx0XHQvLyBGYWlsIGlmIHRoZSBpbnNwZWN0b3IgaGFzIG5vdCBiZWVuIGluaXRpYWxpemVkIHlldCAoYmVmb3JlIHdpbmRvdy5sb2FkKVxyXG5cdFx0aWYgKCF3aW5kb3cubmdJbnNwZWN0b3IpIHtcclxuXHRcdFx0cmV0dXJuIGNvbnNvbGUud2FybignbmctaW5zcGVjdG9yOiBUaGUgcGFnZSBtdXN0IGZpbmlzaCBsb2FkaW5nIGJlZm9yZSB1c2luZyBuZy1pbnNwZWN0b3InKTtcclxuXHRcdH1cclxuXHJcblx0XHR3aW5kb3cubmdJbnNwZWN0b3IudG9nZ2xlKGV2ZW50RGF0YS5zZXR0aW5ncyk7XHJcblx0fVxyXG5cclxufSwgZmFsc2UpOyJdfQ==
