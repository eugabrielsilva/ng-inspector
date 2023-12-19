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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvanMvQXBwLmpzIiwic3JjL2pzL0hpZ2hsaWdodGVyLmpzIiwic3JjL2pzL0luc3BlY3Rvci5qcyIsInNyYy9qcy9JbnNwZWN0b3JBZ2VudC5qcyIsInNyYy9qcy9JbnNwZWN0b3JQYW5lLmpzIiwic3JjL2pzL01vZGVsLmpzIiwic3JjL2pzL01vZGVsTWl4aW4uanMiLCJzcmMvanMvTW9kdWxlLmpzIiwic3JjL2pzL1B1Ymxpc2hFdmVudC5qcyIsInNyYy9qcy9TY29wZS5qcyIsInNyYy9qcy9TZXJ2aWNlLmpzIiwic3JjL2pzL1RyZWVWaWV3LmpzIiwic3JjL2pzL1V0aWxzLmpzIiwic3JjL2pzL2Jvb3RzdHJhcC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIE5HSSA9IHtcclxuXHRJbnNwZWN0b3JBZ2VudDogcmVxdWlyZSgnLi9JbnNwZWN0b3JBZ2VudCcpLFxyXG5cdE1vZHVsZTogcmVxdWlyZSgnLi9Nb2R1bGUnKSxcclxuXHRUcmVlVmlldzogcmVxdWlyZSgnLi9UcmVlVmlldycpLFxyXG5cdFNlcnZpY2U6IHJlcXVpcmUoJy4vU2VydmljZScpXHJcbn07XHJcblxyXG5mdW5jdGlvbiBBcHAobm9kZSwgbW9kdWxlcykge1xyXG5cdHZhciBwYW5lID0gd2luZG93Lm5nSW5zcGVjdG9yLnBhbmU7XHJcblx0dmFyIGFwcCA9IHRoaXM7XHJcblx0dmFyIG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24obXV0YXRpb25zKSB7XHJcblx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG11dGF0aW9ucy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRcdHZhciB0YXJnZXQgPSBtdXRhdGlvbnNbaV0udGFyZ2V0O1xyXG5cclxuXHRcdFx0XHQvLyBBdm9pZCByZXNwb25kaW5nIHRvIG11dGF0aW9ucyBpbiB0aGUgZXh0ZW5zaW9uIFVJXHJcblx0XHRcdFx0aWYgKCFwYW5lLmNvbnRhaW5zKHRhcmdldCkpIHtcclxuXHRcdFx0XHRcdGZvciAodmFyIGYgPSAwOyBmIDwgbXV0YXRpb25zW2ldLmFkZGVkTm9kZXMubGVuZ3RoOyBmKyspIHtcclxuXHRcdFx0XHRcdFx0dmFyIGFkZGVkTm9kZSA9IG11dGF0aW9uc1tpXS5hZGRlZE5vZGVzW2ZdO1xyXG5cdFx0XHRcdFx0XHRpZiAoYWRkZWROb2RlLmNsYXNzTGlzdCAmJiAhYWRkZWROb2RlLmNsYXNzTGlzdC5jb250YWlucygnbmdpLWhsJykpIHtcclxuXHRcdFx0XHRcdFx0XHROR0kuSW5zcGVjdG9yQWdlbnQuaW5zcGVjdE5vZGUoYXBwLCBhZGRlZE5vZGUpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9LCA0KTtcclxuXHR9KTtcclxuXHR2YXIgb2JzZXJ2ZXJDb25maWcgPSB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9O1xyXG5cclxuXHR0aGlzLnN0YXJ0T2JzZXJ2ZXIgPSBmdW5jdGlvbigpIHtcclxuXHRcdG9ic2VydmVyLm9ic2VydmUobm9kZSwgb2JzZXJ2ZXJDb25maWcpO1xyXG5cdH07XHJcblxyXG5cdHRoaXMuc3RvcE9ic2VydmVyID0gZnVuY3Rpb24oKSB7XHJcblx0XHRvYnNlcnZlci5kaXNjb25uZWN0KCk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5ub2RlID0gbm9kZTtcclxuXHJcblx0dGhpcy4kaW5qZWN0b3IgPSB3aW5kb3cuYW5ndWxhci5lbGVtZW50KG5vZGUpLmRhdGEoJyRpbmplY3RvcicpO1xyXG5cdFxyXG5cdGlmICghbW9kdWxlcykge1xyXG5cdFx0bW9kdWxlcyA9IFtdO1xyXG5cdH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZXMgPT09IHR5cGVvZiAnJykge1xyXG5cdFx0bW9kdWxlcyA9IFttb2R1bGVzXTtcclxuXHR9XHJcblxyXG5cdHZhciBwcm9iZXMgPSBbYnVpbHRJblByb2JlXTtcclxuXHR0aGlzLnJlZ2lzdGVyUHJvYmUgPSBmdW5jdGlvbihwcm9iZSkge1xyXG5cdFx0cHJvYmVzLnB1c2gocHJvYmUpO1xyXG5cdH07XHJcblxyXG5cdHRoaXMucHJvYmUgPSBmdW5jdGlvbihub2RlLCBzY29wZSwgaXNJc29sYXRlKSB7XHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHByb2Jlcy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRwcm9iZXNbaV0obm9kZSwgc2NvcGUsIGlzSXNvbGF0ZSk7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0Ly8gQXR0ZW1wdCB0byByZXRyaWV2ZSB0aGUgcHJvcGVydHkgb2YgdGhlIG5nQXBwIGRpcmVjdGl2ZSBpbiB0aGUgbm9kZSBmcm9tXHJcblx0Ly8gb25lIG9mIHRoZSBwb3NzaWJsZSBkZWNsYXJhdGlvbnMgdG8gcmV0cmlldmUgdGhlIEFuZ3VsYXJKUyBtb2R1bGUgZGVmaW5lZFxyXG5cdC8vIGFzIHRoZSBtYWluIGRlcGVuZGVuY3kgZm9yIHRoZSBhcHAuIEFuIGFub255bW91cyBuZ0FwcCBpcyBhIHZhbGlkIHVzZVxyXG5cdC8vIGNhc2UsIHNvIHRoaXMgaXMgb3B0aW9uYWwuXHJcblx0dmFyIGF0dHJzID0gWyduZ1xcXFw6YXBwJywgJ25nLWFwcCcsICd4LW5nLWFwcCcsICdkYXRhLW5nLWFwcCddO1xyXG5cdHZhciBtYWluO1xyXG5cdGlmICgnZ2V0QXR0cmlidXRlJyBpbiBub2RlKSB7XHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGF0dHJzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdGlmIChub2RlLmhhc0F0dHJpYnV0ZShhdHRyc1tpXSkpIHtcclxuXHRcdFx0XHRtYWluID0gbm9kZS5nZXRBdHRyaWJ1dGUoYXR0cnNbaV0pO1xyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRpZiAobWFpbikge1xyXG5cdFx0XHRtb2R1bGVzLnB1c2gobWFpbik7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvLyBSZWdpc3RlciBtb2R1bGUgZGVwZW5kZW5jaWVzXHJcblx0Zm9yICh2YXIgbSA9IDA7IG0gPCBtb2R1bGVzLmxlbmd0aDsgbSsrKSB7XHJcblx0XHROR0kuTW9kdWxlLnJlZ2lzdGVyKHRoaXMsIG1vZHVsZXNbbV0pO1xyXG5cdH1cclxuXHJcblx0dmFyIGxhYmVsID0gbWFpbiA/IG1haW4gOiBub2RlUmVwKG5vZGUpO1xyXG5cdHRoaXMudmlldyA9IE5HSS5UcmVlVmlldy5hcHBJdGVtKGxhYmVsLCBub2RlKTtcclxuXHR3aW5kb3cubmdJbnNwZWN0b3IucGFuZS50cmVlVmlldy5hcHBlbmRDaGlsZCh0aGlzLnZpZXcuZWxlbWVudCk7XHJcbn1cclxuXHJcbi8vIFRoaXMgcHJvYmUgaXMgcmVnaXN0ZXJlZCBieSBkZWZhdWx0IGluIGFsbCBhcHBzLCBhbmQgcHJvYmVzIG5vZGVzXHJcbi8vIGZvciBBbmd1bGFySlMgYnVpbHQtaW4gZGlyZWN0aXZlcyB0aGF0IGFyZSBub3QgZXhwb3NlZCBpbiB0aGUgX2ludm9rZVF1ZXVlXHJcbi8vIGRlc3BpdGUgdGhlICduZycgbW9kdWxlIGJlaW5nIGEgZGVmYXVsdCBkZXBlbmRlbmN5XHJcbmZ1bmN0aW9uIGJ1aWx0SW5Qcm9iZShub2RlLCBzY29wZSkge1xyXG5cclxuXHRpZiAobm9kZSA9PT0gZG9jdW1lbnQpIHtcclxuXHRcdG5vZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaHRtbCcpWzBdO1xyXG5cdH1cclxuXHJcblx0aWYgKG5vZGUgJiYgbm9kZS5oYXNBdHRyaWJ1dGUoJ25nLXJlcGVhdCcpKSB7XHJcblx0XHRzY29wZS52aWV3LmFkZEFubm90YXRpb24oJ25nUmVwZWF0JywgTkdJLlNlcnZpY2UuQlVJTFRJTik7XHJcblx0fVxyXG5cclxuXHQvLyBMYWJlbCBuZy1pbmNsdWRlIHNjb3Blc1xyXG5cdGlmIChub2RlICYmIG5vZGUuaGFzQXR0cmlidXRlKCduZy1pbmNsdWRlJykpIHtcclxuXHRcdHNjb3BlLnZpZXcuYWRkQW5ub3RhdGlvbignbmdJbmNsdWRlJywgTkdJLlNlcnZpY2UuQlVJTFRJTik7XHJcblx0fVxyXG5cclxuXHQvLyBMYWJlbCBuZy1pZiBzY29wZXNcclxuXHRpZiAobm9kZSAmJiBub2RlLmhhc0F0dHJpYnV0ZSgnbmctaWYnKSkge1xyXG5cdFx0c2NvcGUudmlldy5hZGRBbm5vdGF0aW9uKCduZ0lmJywgTkdJLlNlcnZpY2UuQlVJTFRJTik7XHJcblx0fVxyXG5cclxuXHQvLyBMYWJlbCByb290IHNjb3Blc1xyXG5cdGlmIChzY29wZS5uZ1Njb3BlLiRyb290LiRpZCA9PT0gc2NvcGUubmdTY29wZS4kaWQpIHtcclxuXHRcdHNjb3BlLnZpZXcuYWRkQW5ub3RhdGlvbignJHJvb3RTY29wZScsIE5HSS5TZXJ2aWNlLkJVSUxUSU4pO1xyXG5cdH1cclxuXHJcblx0Ly8gTGFiZWwgbmctdHJhbnNjbHVkZSBzY29wZXNcclxuXHRpZiAobm9kZSAmJiBub2RlLnBhcmVudE5vZGUgJiYgbm9kZS5wYXJlbnROb2RlLmhhc0F0dHJpYnV0ZSAmJlxyXG5cdFx0bm9kZS5wYXJlbnROb2RlLmhhc0F0dHJpYnV0ZSgnbmctdHJhbnNjbHVkZScpKSB7XHJcblx0XHRzY29wZS52aWV3LmFkZEFubm90YXRpb24oJ25nVHJhbnNjbHVkZScsIE5HSS5TZXJ2aWNlLkJVSUxUSU4pO1xyXG5cdH1cclxufVxyXG5cclxudmFyIGFwcENhY2hlID0gW107XHJcbkFwcC5ib290c3RyYXAgPSBmdW5jdGlvbihub2RlLCBtb2R1bGVzKSB7XHJcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBhcHBDYWNoZS5sZW5ndGg7IGkrKykge1xyXG5cdFx0aWYgKGFwcENhY2hlW2ldLm5vZGUgPT09IG5vZGUpIHtcclxuXHRcdFx0cmV0dXJuIGFwcENhY2hlW2ldO1xyXG5cdFx0fVxyXG5cdH1cclxuXHR2YXIgbmV3QXBwID0gbmV3IEFwcChub2RlLCBtb2R1bGVzKTtcclxuXHRpZiAod2luZG93Lm5nSW5zcGVjdG9yLnBhbmUudmlzaWJsZSkge1xyXG5cdFx0TkdJLkluc3BlY3RvckFnZW50Lmluc3BlY3RBcHAobmV3QXBwKTtcclxuXHRcdG5ld0FwcC5zdGFydE9ic2VydmVyKCk7XHJcblx0fVxyXG5cdGFwcENhY2hlLnB1c2gobmV3QXBwKTtcclxufTtcclxuXHJcbnZhciBkaWRGaW5kQXBwcyA9IGZhbHNlO1xyXG5cclxuQXBwLmluc3BlY3RBcHBzID0gZnVuY3Rpb24oKSB7XHJcblx0aWYgKCFkaWRGaW5kQXBwcykge1xyXG5cdFx0TkdJLkluc3BlY3RvckFnZW50LmZpbmRBcHBzKEFwcCk7XHJcblx0XHRkaWRGaW5kQXBwcyA9IHRydWU7XHJcblx0fVxyXG5cclxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGFwcENhY2hlLmxlbmd0aDsgaSsrKSB7XHJcblx0XHROR0kuSW5zcGVjdG9yQWdlbnQuaW5zcGVjdEFwcChhcHBDYWNoZVtpXSk7XHJcblx0XHRhcHBDYWNoZVtpXS5zdGFydE9ic2VydmVyKCk7XHJcblx0fVxyXG59O1xyXG5cclxuQXBwLnN0YXJ0T2JzZXJ2ZXJzID0gZnVuY3Rpb24oKSB7XHJcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBhcHBDYWNoZS5sZW5ndGg7IGkrKykge1xyXG5cdFx0YXBwQ2FjaGVbaV0uc3RhcnRPYnNlcnZlcigpO1xyXG5cdH1cclxuXHJcbn07XHJcblxyXG5BcHAuc3RvcE9ic2VydmVycyA9IGZ1bmN0aW9uKCkge1xyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgYXBwQ2FjaGUubGVuZ3RoOyBpKyspIHtcclxuXHRcdGFwcENhY2hlW2ldLnN0b3BPYnNlcnZlcigpO1xyXG5cdH1cclxufTtcclxuXHJcbi8vIFV0aWxpdHkgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGEgRE9NIE5vZGUgdG8gYmUgaW5qZWN0ZWQgaW4gdGhlIFVJLFxyXG4vLyBkaXNwbGF5aW5nIGEgdXNlci1mcmllbmRseSBDU1Mgc2VsZWN0b3ItbGlrZSByZXByZXNlbnRhdGlvbiBvZiBhIERPTSBOb2RlXHJcbi8vIGluIHRoZSBpbnNwZWN0ZWQgYXBwbGljYXRpb25cclxuZnVuY3Rpb24gbm9kZVJlcChub2RlKSB7XHJcblx0dmFyIGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGFiZWwnKTtcclxuXHJcblx0aWYgKG5vZGUgPT09IGRvY3VtZW50KSB7XHJcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9ICdkb2N1bWVudCc7XHJcblx0XHRyZXR1cm4gbGFiZWw7XHJcblx0fVxyXG5cclxuXHQvLyB0YWdcclxuXHRsYWJlbC50ZXh0Q29udGVudCA9IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuXHQvLyAjaWRcclxuXHRpZiAobm9kZS5oYXNBdHRyaWJ1dGUoJ2lkJykpIHtcclxuXHRcdHZhciBzbWFsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NtYWxsJyk7XHJcblx0XHRzbWFsbC50ZXh0Q29udGVudCA9ICcjJyArIG5vZGUuZ2V0QXR0cmlidXRlKCdpZCcpO1xyXG5cdFx0bGFiZWwuYXBwZW5kQ2hpbGQoc21hbGwpO1xyXG5cdH1cclxuXHJcblx0Ly8gLmNsYXNzLmxpc3RcclxuXHR2YXIgY2xhc3NMaXN0ID0gbm9kZS5jbGFzc05hbWUuc3BsaXQoL1xccy8pO1xyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgY2xhc3NMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcblx0XHR2YXIgc21hbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzbWFsbCcpO1xyXG5cdFx0c21hbGwudGV4dENvbnRlbnQgPSAnLicgKyBjbGFzc0xpc3RbaV07XHJcblx0XHRsYWJlbC5hcHBlbmRDaGlsZChzbWFsbCk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gbGFiZWw7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQXBwO1xyXG4iLCJmdW5jdGlvbiBIaWdobGlnaHRlcigpIHt9XHJcblxyXG5mdW5jdGlvbiBvZmZzZXRzKG5vZGUpIHtcclxuXHR2YXIgdmFscyA9IHtcclxuXHRcdHg6IG5vZGUub2Zmc2V0TGVmdCxcclxuXHRcdHk6IG5vZGUub2Zmc2V0VG9wLFxyXG5cdFx0dzogbm9kZS5vZmZzZXRXaWR0aCxcclxuXHRcdGg6IG5vZGUub2Zmc2V0SGVpZ2h0XHJcblx0fTtcclxuXHR3aGlsZSAobm9kZSA9IG5vZGUub2Zmc2V0UGFyZW50KSB7XHJcblx0XHR2YWxzLnggKz0gbm9kZS5vZmZzZXRMZWZ0O1xyXG5cdFx0dmFscy55ICs9IG5vZGUub2Zmc2V0VG9wO1xyXG5cdH1cclxuXHRyZXR1cm4gdmFscztcclxufVxyXG5cclxudmFyIGhscyA9IFtdO1xyXG5IaWdobGlnaHRlci5obCA9IGZ1bmN0aW9uKG5vZGUsIGxhYmVsKSB7XHJcblx0dmFyIGJveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdGJveC5jbGFzc05hbWUgPSAnbmdpLWhsIG5naS1obC1zY29wZSc7XHJcblx0aWYgKGxhYmVsKSB7XHJcblx0XHRib3gudGV4dENvbnRlbnQgPSBsYWJlbDtcclxuXHR9XHJcblx0dmFyIHBvcyA9IG9mZnNldHMobm9kZSk7XHJcblx0Ym94LnN0eWxlLmxlZnQgPSBwb3MueCArICdweCc7XHJcblx0Ym94LnN0eWxlLnRvcCA9IHBvcy55ICsgJ3B4JztcclxuXHRib3guc3R5bGUud2lkdGggPSBwb3MudyArICdweCc7XHJcblx0Ym94LnN0eWxlLmhlaWdodCA9IHBvcy5oICsgJ3B4JztcclxuXHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGJveCk7XHJcblx0aGxzLnB1c2goYm94KTtcclxuXHRyZXR1cm4gYm94O1xyXG59O1xyXG5cclxuSGlnaGxpZ2h0ZXIuY2xlYXIgPSBmdW5jdGlvbigpIHtcclxuXHR2YXIgYm94O1xyXG5cdHdoaWxlIChib3ggPSBobHMucG9wKCkpIHtcclxuXHRcdGJveC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGJveCk7XHJcblx0fVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBIaWdobGlnaHRlcjtcclxuIiwidmFyIE5HSSA9IHtcclxuXHRJbnNwZWN0b3JQYW5lOiByZXF1aXJlKCcuL0luc3BlY3RvclBhbmUnKSxcclxuXHRBcHA6IHJlcXVpcmUoJy4vQXBwJyksXHJcblx0U2NvcGU6IHJlcXVpcmUoJy4vU2NvcGUnKVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcclxuXHJcblx0Ly8gU2V0dGluZ3MgZGVmYXVsdHNcclxuXHR0aGlzLnNldHRpbmdzID0ge1xyXG5cdFx0c2hvd1dhcm5pbmdzOiBmYWxzZVxyXG5cdH07XHJcblxyXG5cdHRoaXMucGFuZSA9IG5ldyBOR0kuSW5zcGVjdG9yUGFuZSgpO1xyXG5cclxuXHQvLyBUaGUgYWN0dWFsIHRvZ2dsaW5nIGlzIGRvbmUgYnkgdGhlIGBOR0kuSW5zcGVjdG9yUGFuZWAuIFNpbmNlIHRoZVxyXG5cdC8vIGBuZy1pbnNwZWN0b3IuanNgIHNjcmlwdCBpcyBpbmplY3RlZCBpbnRvIHRoZSBwYWdlIERPTSB3aXRoIG5vIGRpcmVjdFxyXG5cdC8vIGFjY2VzcyB0byBgc2FmYXJpLmV4dGVuc2lvbi5zZXR0aW5nc2AsIHNldHRpbmdzIGNhbiBvbmx5IGJlIHNlbnQgdmlhXHJcblx0Ly8gbWVzc2FnZXMuIFRvIHNhdmUgb24gdGhlIG51bWJlciBvZiBtZXNzYWdlcyBzZW50IGJhY2sgYW5kIGZvcnRoIGJldHdlZW5cclxuXHQvLyB0aGlzIGluamVjdGVkIHNjcmlwdCBhbmQgdGhlIGJyb3dzZXIgZXh0ZW5zaW9uLCB0aGUgYnJvd3NlciBzZXR0aW5ncyBhcmVcclxuXHQvLyBzZW50IGFsb25nIHdpdGggdGhlIHRvZ2dsZSBjb21tYW5kLiBBIHNpZGUgZWZmZWN0IGlzIHRoYXQgY2hhbmdlcyBpbiB0aGVcclxuXHQvLyBzZXR0aW5ncyBvbmx5IHRha2UgcGxhY2UgYWZ0ZXIgYSB0b2dnbGUgaXMgdHJpZ2dlcmVkLlxyXG5cdHRoaXMudG9nZ2xlID0gZnVuY3Rpb24oc2V0dGluZ3MpIHtcclxuXHJcblx0XHQvLyBJZiBhbmd1bGFyIGlzIG5vdCBwcmVzZW50IGluIHRoZSBnbG9iYWwgc2NvcGUsIHdlIHN0b3AgdGhlIHByb2Nlc3NcclxuXHRcdGlmICghKCdhbmd1bGFyJyBpbiB3aW5kb3cpKSB7XHJcblx0XHRcdGFsZXJ0KCdUaGlzIHBhZ2UgZG9lcyBub3QgaW5jbHVkZSBBbmd1bGFySlMnKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIFBhc3NpbmcgdGhlIHNldHRpbmdzIHBhcmFtZXRlciBpcyBvcHRpb25hbFxyXG5cdFx0dGhpcy5zZXR0aW5ncy5zaG93V2FybmluZ3MgPSAoc2V0dGluZ3MgJiYgISFzZXR0aW5ncy5zaG93V2FybmluZyk7XHJcblxyXG5cdFx0Ly8gU2VuZCB0aGUgY29tbWFuZCBmb3J3YXJkIHRvIHRoZSBOR0kuSW5zcGVjdG9yUGFuZSwgcmV0cmlldmluZyB0aGUgc3RhdGVcclxuXHRcdHZhciB2aXNpYmxlID0gdGhpcy5wYW5lLnRvZ2dsZSgpO1xyXG5cdFx0aWYgKHZpc2libGUpIHtcclxuXHRcdFx0TkdJLkFwcC5pbnNwZWN0QXBwcygpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0TkdJLkFwcC5zdG9wT2JzZXJ2ZXJzKCk7XHJcblx0XHRcdE5HSS5TY29wZS5zdG9wT2JzZXJ2ZXJzKCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvLyBEZWJ1Z2dpbmcgdXRsaXR5LCB0byBiZSB1c2VkIGluIHRoZSBjb25zb2xlLiBSZXRyaWV2ZXMgdGhlIFwiYnJlYWRjcnVtYlwiIG9mXHJcblx0Ly8gYSBzcGVjaWZpYyBzY29wZSBpbiB0aGUgaGllcmFyY2h5IHVzYWdlOiBuZ0luc3BlY3Rvci5zY29wZSgnMDAyJylcclxuXHR3aW5kb3cuJHNjb3BlSWQgPSBmdW5jdGlvbihpZCkge1xyXG5cclxuXHRcdGZ1bmN0aW9uIGZpbmRSb290KGVsKSB7XHJcblx0XHRcdHZhciBjaGlsZCA9IGVsLmZpcnN0Q2hpbGQ7XHJcblx0XHRcdGlmICghY2hpbGQpIHJldHVybjtcclxuXHRcdFx0ZG8ge1xyXG5cdFx0XHRcdHZhciAkZWwgPSBhbmd1bGFyLmVsZW1lbnQoZWwpO1xyXG5cclxuXHRcdFx0XHRpZiAoJGVsLmRhdGEoJyRzY29wZScpKSB7XHJcblx0XHRcdFx0XHRyZXR1cm4gJGVsLmRhdGEoJyRzY29wZScpLiRyb290O1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0dmFyIHJlcyA9IGZpbmRSb290KGNoaWxkKTtcclxuXHRcdFx0XHRpZiAocmVzKSByZXR1cm4gcmVzO1xyXG5cclxuXHRcdFx0fSB3aGlsZSAoY2hpbGQgPSBjaGlsZC5uZXh0U2libGluZyk7XHJcblx0XHR9XHJcblxyXG5cdFx0ZnVuY3Rpb24gZGlnKHNjb3BlLCBicmVhZGNydW1iKSB7XHJcblx0XHRcdHZhciBuZXdCcmVhZGNydW1iID0gYnJlYWRjcnVtYi5zbGljZSgwKTtcclxuXHRcdFx0bmV3QnJlYWRjcnVtYi5wdXNoKHNjb3BlLiRpZCk7XHJcblxyXG5cdFx0XHRpZiAoc2NvcGUuJGlkID09IGlkKSB7XHJcblx0XHRcdFx0Y29uc29sZS5sb2cobmV3QnJlYWRjcnVtYik7XHJcblx0XHRcdFx0cmV0dXJuIHNjb3BlO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR2YXIgY2hpbGQgPSBzY29wZS4kJGNoaWxkSGVhZDtcclxuXHJcblx0XHRcdGlmICghY2hpbGQpIHJldHVybjtcclxuXHJcblx0XHRcdGRvIHtcclxuXHRcdFx0XHR2YXIgcmVzID0gZGlnKGNoaWxkLCBuZXdCcmVhZGNydW1iKTtcclxuXHRcdFx0XHRpZiAocmVzKSByZXR1cm4gcmVzO1xyXG5cdFx0XHR9IHdoaWxlIChjaGlsZCA9IGNoaWxkLiQkbmV4dFNpYmxpbmcpO1xyXG5cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gZGlnKGZpbmRSb290KGRvY3VtZW50KSwgW10pO1xyXG5cdH07XHJcblxyXG59OyIsIi8vIGBOR2kuSW5zcGVjdG9yQWdlbnRgIGlzIHJlc3BvbnNpYmxlIGZvciB0aGUgcGFnZSBpbnRyb3NwZWN0aW9uIChTY29wZSBhbmQgRE9NXHJcbi8vIHRyYXZlcnNhbClcclxuXHJcbnZhciBOR0kgPSB7XHJcblx0U2NvcGU6IHJlcXVpcmUoJy4vU2NvcGUnKVxyXG59O1xyXG5cclxuZnVuY3Rpb24gSW5zcGVjdG9yQWdlbnQoKSB7fVxyXG5cclxuZnVuY3Rpb24gdHJhdmVyc2VET00oYXBwLCBub2RlKSB7XHJcblxyXG5cdC8vIENvdW50ZXIgZm9yIHRoZSByZWN1cnNpb25zIGJlaW5nIHNjaGVkdWxlZCB3aXRoIHNldFRpbWVvdXRcclxuXHR2YXIgbm9kZVF1ZXVlID0gMTtcclxuXHR0cmF2ZXJzZShub2RlLCBhcHApO1xyXG5cclxuXHQvLyBUaGUgcmVjdXJzaXZlIERPTSB0cmF2ZXJzYWwgZnVuY3Rpb25cclxuXHRmdW5jdGlvbiB0cmF2ZXJzZShub2RlLCBhcHApIHtcclxuXHJcblx0XHQvLyBXZSBjYW4gc2tpcCBhbGwgbm9kZVR5cGVzIGV4Y2VwdCBFTEVNRU5UIGFuZCBET0NVTUVOVCBub2Rlc1xyXG5cdFx0aWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFIHx8XHJcblx0XHRcdCBub2RlLm5vZGVUeXBlID09PSBOb2RlLkRPQ1VNRU5UX05PREUpIHtcclxuXHJcblx0XHRcdC8vIFdyYXAgdGhlIERPTSBub2RlIHRvIGdldCBhY2Nlc3MgdG8gYW5ndWxhci5lbGVtZW50IG1ldGhvZHNcclxuXHRcdFx0dmFyICRub2RlID0gd2luZG93LmFuZ3VsYXIuZWxlbWVudChub2RlKTtcclxuXHJcblx0XHRcdHZhciBub2RlRGF0YSA9ICRub2RlLmRhdGEoKTtcclxuXHJcblx0XHRcdC8vIElmIHRoZXJlJ3Mgbm8gQW5ndWxhckpTIG1ldGFkYXRhIGluIHRoZSBub2RlIC5kYXRhKCkgc3RvcmUsIHdlXHJcblx0XHRcdC8vIGp1c3QgbW92ZSBvblxyXG5cdFx0XHRpZiAobm9kZURhdGEgJiYgT2JqZWN0LmtleXMobm9kZURhdGEpLmxlbmd0aCA+IDApIHtcclxuXHJcblx0XHRcdFx0Ly8gTWF0Y2ggbm9kZXMgd2l0aCBzY29wZXMgYXR0YWNoZWQgdG8gdGhlIHJlbGV2YW50IFRyZWVWaWV3SXRlbVxyXG5cdFx0XHRcdHZhciAkc2NvcGUgPSBub2RlRGF0YS4kc2NvcGU7XHJcblx0XHRcdFx0aWYgKCRzY29wZSkge1xyXG5cdFx0XHRcdFx0dmFyIHNjb3BlTWF0Y2ggPSBOR0kuU2NvcGUuZ2V0KCRzY29wZS4kaWQpO1xyXG5cdFx0XHRcdFx0aWYgKHNjb3BlTWF0Y2gpIHtcclxuXHRcdFx0XHRcdFx0c2NvcGVNYXRjaC5zZXROb2RlKG5vZGUpO1xyXG5cdFx0XHRcdFx0XHRhcHAucHJvYmUobm9kZSwgc2NvcGVNYXRjaCwgZmFsc2UpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Ly8gTWF0Y2ggbm9kZXMgd2l0aCBpc29sYXRlIHNjb3BlcyBhdHRhY2hlZCB0byB0aGUgcmVsZXZhbnRcclxuXHRcdFx0XHQvLyBUcmVlVmlld0l0ZW1cclxuXHRcdFx0XHRpZiAoJG5vZGUuaXNvbGF0ZVNjb3BlKSB7XHJcblx0XHRcdFx0XHR2YXIgJGlzb2xhdGUgPSAkbm9kZS5pc29sYXRlU2NvcGUoKTtcclxuXHRcdFx0XHRcdGlmICgkaXNvbGF0ZSkge1x0XHJcblx0XHRcdFx0XHRcdHZhciBpc29sYXRlTWF0Y2ggPSBOR0kuU2NvcGUuZ2V0KCRpc29sYXRlLiRpZCk7XHJcblx0XHRcdFx0XHRcdGlmIChpc29sYXRlTWF0Y2gpIHtcclxuXHRcdFx0XHRcdFx0XHRpc29sYXRlTWF0Y2guc2V0Tm9kZShub2RlKTtcclxuXHRcdFx0XHRcdFx0XHRhcHAucHJvYmUobm9kZSwgaXNvbGF0ZU1hdGNoLCB0cnVlKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKG5vZGUuZmlyc3RDaGlsZCkge1xyXG5cdFx0XHRcdHZhciBjaGlsZCA9IG5vZGUuZmlyc3RDaGlsZDtcclxuXHRcdFx0XHRkbyB7XHJcblx0XHRcdFx0XHQvLyBJbmNyZW1lbnQgdGhlIHByb2JlZCBub2RlcyBjb3VudGVyLCB3aWxsIGJlIHVzZWQgZm9yIHJlcG9ydGluZ1xyXG5cdFx0XHRcdFx0bm9kZVF1ZXVlKys7XHJcblxyXG5cdFx0XHRcdFx0Ly8gc2V0VGltZW91dCBpcyB1c2VkIHRvIG1ha2UgdGhlIHRyYXZlcnNhbCBhc3luY3Job25vdXMsIGtlZXBpbmdcclxuXHRcdFx0XHRcdC8vIHRoZSBicm93c2VyIFVJIHJlc3BvbnNpdmUgZHVyaW5nIHRyYXZlcnNhbC5cclxuXHRcdFx0XHRcdHNldFRpbWVvdXQodHJhdmVyc2UuYmluZCh0aGlzLCBjaGlsZCwgYXBwKSk7XHJcblx0XHRcdFx0fSB3aGlsZSAoY2hpbGQgPSBjaGlsZC5uZXh0U2libGluZyk7XHJcblx0XHRcdH1cclxuXHJcblx0XHR9XHJcblx0XHRub2RlUXVldWUtLTtcclxuXHRcdGlmICgtLW5vZGVRdWV1ZSA9PT0gMCkge1xyXG5cdFx0XHQvLyBEb25lXHJcblx0XHR9XHJcblx0XHRcclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRyYXZlcnNlU2NvcGVzKG5nU2NvcGUsIGFwcCwgY2FsbGJhY2spIHtcclxuXHJcblx0dmFyIHNjb3BlUXVldWUgPSAxO1xyXG5cdHRyYXZlcnNlKG5nU2NvcGUpO1xyXG5cclxuXHRmdW5jdGlvbiB0cmF2ZXJzZShuZ1Njb3BlKSB7XHJcblx0XHR2YXIgc2NvcGVSZXAgPSBOR0kuU2NvcGUuaW5zdGFuY2UoYXBwLCBuZ1Njb3BlKTtcclxuXHRcdHNjb3BlUmVwLnN0YXJ0T2JzZXJ2ZXIoKTtcclxuXHJcblx0XHRpZiAobmdTY29wZS4kcGFyZW50KSB7XHJcblx0XHRcdHZhciBwYXJlbnQgPSBOR0kuU2NvcGUuZ2V0KG5nU2NvcGUuJHBhcmVudC4kaWQpLnZpZXc7XHJcblx0XHRcdHBhcmVudC5hZGRDaGlsZChzY29wZVJlcC52aWV3KTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGFwcC52aWV3LmFkZENoaWxkKHNjb3BlUmVwLnZpZXcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBjaGlsZCA9IG5nU2NvcGUuJCRjaGlsZEhlYWQ7XHJcblx0XHRpZiAoY2hpbGQpIHtcclxuXHRcdFx0ZG8ge1xyXG5cdFx0XHRcdHNjb3BlUXVldWUrKztcclxuXHRcdFx0XHRzZXRUaW1lb3V0KHRyYXZlcnNlLmJpbmQodGhpcywgY2hpbGQpKTtcclxuXHRcdFx0fSB3aGlsZSAoY2hpbGQgPSBjaGlsZC4kJG5leHRTaWJsaW5nKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoLS1zY29wZVF1ZXVlID09PSAwKSB7XHJcblx0XHRcdC8vIERvbmVcclxuXHRcdFx0aWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykgY2FsbGJhY2soKTtcclxuXHRcdH1cclxuXHR9XHJcbn1cclxuXHJcbi8vIEFkZHMgdGhlIFRyZWVWaWV3IGl0ZW0gZm9yIHRoZSBBbmd1bGFySlMgYXBwbGljYXRpb24gYm9vdHN0cmFwcGVkIGF0XHJcbi8vIHRoZSBgbm9kZWAgYXJndW1lbnQuXHJcbkluc3BlY3RvckFnZW50Lmluc3BlY3RBcHAgPSBmdW5jdGlvbihhcHApIHtcclxuXHJcblx0d2luZG93Lm5nSW5zcGVjdG9yLnBhbmUudHJlZVZpZXcuYXBwZW5kQ2hpbGQoYXBwLnZpZXcuZWxlbWVudCk7XHJcblxyXG5cdC8vIFdpdGggdGhlIHJvb3QgTm9kZSBmb3IgdGhlIGFwcCwgd2UgcmV0cmlldmUgdGhlICRyb290U2NvcGVcclxuXHR2YXIgJG5vZGUgPSB3aW5kb3cuYW5ndWxhci5lbGVtZW50KGFwcC5ub2RlKTtcclxuXHR2YXIgJHJvb3RTY29wZSA9ICRub2RlLmRhdGEoJyRzY29wZScpLiRyb290O1xyXG5cclxuXHQvLyBUaGVuIHN0YXJ0IHRoZSBTY29wZSB0cmF2ZXJzYWwgbWVjaGFuaXNtXHJcblx0dHJhdmVyc2VTY29wZXMoJHJvb3RTY29wZSwgYXBwLCBmdW5jdGlvbigpIHtcclxuXHJcblx0XHQvLyBPbmNlIHRoZSBTY29wZSB0cmF2ZXJzYWwgaXMgY29tcGxldGUsIHRoZSBET00gdHJhdmVyc2FsIHN0YXJ0c1xyXG5cdFx0dHJhdmVyc2VET00oYXBwLCBhcHAubm9kZSk7XHJcblx0XHRcclxuXHR9KTtcclxufTtcclxuXHJcbkluc3BlY3RvckFnZW50Lmluc3BlY3RTY29wZSA9IGZ1bmN0aW9uKGFwcCwgc2NvcGUpIHtcclxuXHR0cmF2ZXJzZVNjb3BlcyhzY29wZSwgYXBwKTtcclxufTtcclxuXHJcbkluc3BlY3RvckFnZW50Lmluc3BlY3ROb2RlID0gZnVuY3Rpb24oYXBwLCBub2RlKSB7XHJcblx0dHJhdmVyc2VET00oYXBwLCBub2RlKTtcclxufTtcclxuXHJcbkluc3BlY3RvckFnZW50LmZpbmRBcHBzID0gZnVuY3Rpb24gKEFwcCkge1xyXG5cclxuXHR2YXIgbm9kZVF1ZXVlID0gMTtcclxuXHJcblx0Ly8gRE9NIFRyYXZlcnNhbCB0byBmaW5kIEFuZ3VsYXJKUyBBcHAgcm9vdCBlbGVtZW50cy4gVHJhdmVyc2FsIGlzXHJcblx0Ly8gaW50ZXJydXB0ZWQgd2hlbiBhbiBBcHAgaXMgZm91bmQgKHRyYXZlcnNhbCBpbnNpZGUgdGhlIEFwcCBpcyBkb25lIGJ5IHRoZVxyXG5cdC8vIEluc3BlY3RvckFnZW50Lmluc3BlY3RBcHAgbWV0aG9kKVxyXG5cdGZ1bmN0aW9uIHRyYXZlcnNlKG5vZGUpIHtcclxuXHJcblx0XHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUgfHxcclxuXHRcdFx0IG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRE9DVU1FTlRfTk9ERSkge1xyXG5cclxuXHRcdFx0dmFyICRub2RlID0gd2luZG93LmFuZ3VsYXIuZWxlbWVudChub2RlKTtcclxuXHJcblx0XHRcdGlmICgkbm9kZS5kYXRhKCckaW5qZWN0b3InKSkge1xyXG5cdFx0XHRcdEFwcC5ib290c3RyYXAobm9kZSk7XHJcblx0XHRcdH0gZWxzZSBpZiAobm9kZS5maXJzdENoaWxkKSB7XHJcblx0XHRcdFx0dmFyIGNoaWxkID0gbm9kZS5maXJzdENoaWxkO1xyXG5cdFx0XHRcdGRvIHtcclxuXHRcdFx0XHRcdG5vZGVRdWV1ZSsrO1xyXG5cdFx0XHRcdFx0c2V0VGltZW91dCh0cmF2ZXJzZS5iaW5kKHRoaXMsIGNoaWxkKSwgNCk7XHJcblx0XHRcdFx0fSB3aGlsZSAoY2hpbGQgPSBjaGlsZC5uZXh0U2libGluZyk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdG5vZGVRdWV1ZS0tO1xyXG5cdFx0XHRpZiAoLS1ub2RlUXVldWUgPT09IDApIHtcclxuXHRcdFx0XHQvLyBEb25lXHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHRyYXZlcnNlKGRvY3VtZW50KTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gSW5zcGVjdG9yQWdlbnQ7XHJcbiIsIi8qKlxyXG4gKiBgTkdJLkluc3BlY3RvclBhbmVgIGlzIHJlc3BvbnNpYmxlIGZvciB0aGUgcm9vdCBlbGVtZW50IGFuZCBiYXNpYyBpbnRlcmFjdGlvblxyXG4gKiB3aXRoIHRoZSBwYW5lIChpbiBwcmFjdGljZSwgYSA8ZGl2PikgaW5qZWN0ZWQgaW4gdGhlIHBhZ2UgRE9NLCBzdWNoIGFzXHJcbiAqIHRvZ2dsaW5nIHRoZSBwYW5lIG9uIGFuZCBvZmYsIGhhbmRsZSBtb3VzZSBzY3JvbGxpbmcsIHJlc2l6aW5nIGFuZCBmaXJzdFxyXG4gKiBsZXZlbCBvZiBjaGlsZCB2aWV3cy5cclxuICovXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG5cclxuXHQvLyBUaGUgd2lkdGggb2YgdGhlIHBhbmUgY2FuIGJlIHJlc2l6ZWQgYnkgdGhlIHVzZXIsIGFuZCBpcyBwZXJzaXN0ZWQgdmlhXHJcblx0Ly8gbG9jYWxTdG9yYWdlXHJcblx0dmFyIGluc3BlY3RvcldpZHRoID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ25nLWluc3BlY3Rvci13aWR0aCcpIHx8IDMwMDtcclxuXHJcblx0Ly8gUXVpY2tlciByZWZlcmVuY2UgdG8gYm9keSB0aHJvdWdoLW91dCBJbnNwZWN0b3JQYW5lIGxleGljYWwgc2NvcGVcclxuXHR2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XHJcblxyXG5cdC8vIENyZWF0ZSB0aGUgcm9vdCBET00gbm9kZSBmb3IgdGhlIGluc3BlY3RvciBwYW5lXHJcblx0dmFyIHBhbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuXHRwYW5lLmNsYXNzTmFtZSA9ICduZ2ktaW5zcGVjdG9yJztcclxuXHRwYW5lLnN0eWxlLndpZHRoID0gaW5zcGVjdG9yV2lkdGggKyAncHgnO1xyXG5cclxuXHQvLyBDcmVhdGUgYW5kIGV4cG9zZSB0aGUgcm9vdCBET00gbm9kZSBmb3IgdGhlIHRyZWVWaWV3XHJcblx0dGhpcy50cmVlVmlldyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdHBhbmUuYXBwZW5kQ2hpbGQodGhpcy50cmVlVmlldyk7XHJcblxyXG5cdHRoaXMuYWRkVmlldyA9IGZ1bmN0aW9uKHZpZXcpIHtcclxuXHRcdHBhbmUuYXBwZW5kQ2hpbGQodmlldyk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5jbGVhciA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0d2hpbGUodGhpcy50cmVlVmlldy5sYXN0Q2hpbGQpIHtcclxuXHRcdFx0dGhpcy50cmVlVmlldy5yZW1vdmVDaGlsZCh0aGlzLnRyZWVWaWV3Lmxhc3RDaGlsZCk7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0Ly8gVXNlZCB0byBhdm9pZCB0cmF2ZXJzaW5nIG9yIGluc3BlY3RpbmcgdGhlIGV4dGVuc2lvbiBVSVxyXG5cdHRoaXMuY29udGFpbnMgPSBmdW5jdGlvbihub2RlKSB7XHJcblx0XHRyZXR1cm4gdGhpcy50cmVlVmlldy5jb250YWlucyhub2RlKTtcclxuXHR9O1xyXG5cclxuXHR0aGlzLnZpc2libGUgPSBmYWxzZTtcclxuXHJcblx0Ly8gVG9nZ2xlIHRoZSBpbnNwZWN0b3IgcGFuZSBvbiBhbmQgb2ZmLiBSZXR1cm5zIGEgYm9vbGVhbiByZXByZXNlbnRpbmcgdGhlXHJcblx0Ly8gbmV3IHZpc2liaWxpdHkgc3RhdGUuXHJcblx0dGhpcy50b2dnbGUgPSBmdW5jdGlvbigpIHtcclxuXHRcdHZhciBldmVudHMgPSB7XHJcblx0XHRcdG1vdXNlbW92ZToge2ZuOiBvbk1vdXNlTW92ZSwgdGFyZ2V0OiBkb2N1bWVudH0sXHJcblx0XHRcdG1vdXNlZG93bjoge2ZuOiBvbk1vdXNlRG93biwgdGFyZ2V0OiBkb2N1bWVudH0sXHJcblx0XHRcdG1vdXNldXA6IHtmbjogb25Nb3VzZVVwLCB0YXJnZXQ6IGRvY3VtZW50fSxcclxuXHRcdFx0cmVzaXplOiB7Zm46IG9uUmVzaXplLCB0YXJnZXQ6IHdpbmRvd31cclxuXHRcdH07XHJcblxyXG5cdFx0aWYgKCBwYW5lLnBhcmVudE5vZGUgKSB7XHJcblx0XHRcdGJvZHkucmVtb3ZlQ2hpbGQocGFuZSk7XHJcblx0XHRcdHRoaXMuY2xlYXIoKTtcclxuXHRcdFx0ZXZlbnRMaXN0ZW5lckJ1bGsoZXZlbnRzLCB0cnVlKTtcclxuXHRcdFx0Ym9keS5jbGFzc0xpc3QucmVtb3ZlKCduZ2ktb3BlbicpO1xyXG5cdFx0XHRyZXR1cm4gdGhpcy52aXNpYmxlID0gZmFsc2U7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRib2R5LmFwcGVuZENoaWxkKHBhbmUpO1xyXG5cdFx0XHRldmVudExpc3RlbmVyQnVsayhldmVudHMsIGZhbHNlKTtcclxuXHRcdFx0Ym9keS5jbGFzc0xpc3QuYWRkKCduZ2ktb3BlbicpO1xyXG5cdFx0XHRyZXR1cm4gdGhpcy52aXNpYmxlID0gdHJ1ZTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHQvLyBQcmV2ZW50IHNjcm9sbGluZyB0aGUgcGFnZSB3aGVuIHRoZSBzY3JvbGxpbmcgaW5zaWRlIHRoZSBpbnNwZWN0b3IgcGFuZVxyXG5cdC8vIHJlYWNoZXMgdGhlIHRvcCBhbmQgYm90dG9tIGxpbWl0c1xyXG5cdHBhbmUuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V3aGVlbCcsIGZ1bmN0aW9uKGV2ZW50KSB7XHJcblx0XHRpZiAoKGV2ZW50LndoZWVsRGVsdGFZID4gMCAmJiBwYW5lLnNjcm9sbFRvcCA9PT0gMCkgfHxcclxuXHRcdFx0KGV2ZW50LndoZWVsRGVsdGFZIDwgMCAmJiAoXHJcblx0XHRcdFx0cGFuZS5zY3JvbGxUb3AgKyBwYW5lLm9mZnNldEhlaWdodCkgPT09IHBhbmUuc2Nyb2xsSGVpZ2h0XHJcblx0XHRcdCkpIHtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdH1cclxuXHR9KTtcclxuXHJcblx0Ly8gQ2F0Y2ggY2xpY2tzIGF0IHRoZSB0b3Agb2YgdGhlIHBhbmUsIGFuZCBzdG9wIHRoZW0sIHRvIHByZXZlbnRcclxuXHQvLyB0cmlnZ2VyaW5nIGJlaGF2aW9yIGluIHRoZSBhcHAgYmVpbmcgaW5zcGVjdGVkXHJcblx0cGFuZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uKGV2ZW50KSB7XHJcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuXHR9KTtcclxuXHJcblx0Ly8gU3RhdGVzIGZvciB0aGUgaW5zcGVjdG9yIHBhbmUgcmVzaXppbmcgZnVuY3Rpb25hbGl0eVxyXG5cdHZhciBpc1Jlc2l6aW5nID0gZmFsc2U7XHJcblx0dmFyIGNhblJlc2l6ZSA9IGZhbHNlO1xyXG5cclxuXHQvLyBEZWZpbmVzIGhvdyBtYW55IHBpeGVscyB0byB0aGUgbGVmdCBhbmQgcmlnaHQgb2YgdGhlIGJvcmRlciBvZiB0aGUgcGFuZVxyXG5cdC8vIGFyZSBjb25zaWRlcmVkIHdpdGhpbiB0aGUgcmVzaXplIGhhbmRsZVxyXG5cdHZhciBMRUZUX1JFU0laRV9IQU5ETEVfUEFEID0gMztcclxuXHR2YXIgUklHSFRfUkVTSVpFX0hBTkRMRV9QQUQgPSAyO1xyXG5cdHZhciBNSU5JTVVNX1dJRFRIID0gNTA7XHJcblx0dmFyIE1BWElNVU1fV0lEVEggPSAxMDA7XHJcblxyXG5cdC8vIExpc3RlbiBmb3IgbW91c2Vtb3ZlIGV2ZW50cyBpbiB0aGUgcGFnZSBib2R5LCBzZXR0aW5nIHRoZSBjYW5SZXNpemUgc3RhdGVcclxuXHQvLyBpZiB0aGUgbW91c2UgaG92ZXJzIGNsb3NlIHRvIHRoZVxyXG5cdGZ1bmN0aW9uIG9uTW91c2VNb3ZlKGV2ZW50KSB7XHJcblxyXG5cdFx0Ly8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgdGhlIGluc3BlY3RvciBpcyBkZXRhY2hlZCBmcm9tIHRoZSBET01cclxuXHRcdGlmICghcGFuZS5wYXJlbnROb2RlKSByZXR1cm47XHJcblxyXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIG1vdXNlIGN1cnNvciBpcyBjdXJyZW50bHkgaG92ZXJpbmcgdGhlIHJlc2l6ZSBoYW5kbGUsXHJcblx0XHQvLyBjb25zaXN0aW5nIG9mIHRoZSB2ZXJ0aWNhbCBwaXhlbCBjb2x1bW4gb2YgdGhlIGluc3BlY3RvciBib3JkZXIgcGx1c1xyXG5cdFx0Ly8gYSBwYWQgb2YgcGl4ZWwgY29sdW1ucyB0byB0aGUgbGVmdCBhbmQgcmlnaHQuIFRoZSBjbGFzcyBhZGRlZCB0b1xyXG5cdFx0Ly8gdGhlIHBhZ2UgYm9keSBpcyB1c2VkIGZvciBzdHlsaW5nIHRoZSBjdXJzb3IgdG8gYGNvbC1yZXNpemVgXHJcblx0XHRpZiAocGFuZS5vZmZzZXRMZWZ0IC0gTEVGVF9SRVNJWkVfSEFORExFX1BBRCA8PSBldmVudC5jbGllbnRYICYmXHJcblx0XHRcdGV2ZW50LmNsaWVudFggPD0gcGFuZS5vZmZzZXRMZWZ0ICsgUklHSFRfUkVTSVpFX0hBTkRMRV9QQUQpIHtcclxuXHRcdFx0Y2FuUmVzaXplID0gdHJ1ZTtcclxuXHRcdFx0Ym9keS5jbGFzc0xpc3QuYWRkKCduZ2ktcmVzaXplJyk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRjYW5SZXNpemUgPSBmYWxzZTtcclxuXHRcdFx0Ym9keS5jbGFzc0xpc3QucmVtb3ZlKCduZ2ktcmVzaXplJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gSWYgdGhlIHVzZXIgaXMgY3VycmVudGx5IHBlcmZvcm1pbmcgYSByZXNpemUsIHRoZSB3aWR0aCBpcyBhZGp1c3RlZFxyXG5cdFx0Ly8gYmFzZWQgb24gdGhlIGN1cnNvciBwb3NpdGlvblxyXG5cdFx0aWYgKGlzUmVzaXppbmcpIHtcclxuXHJcblx0XHRcdHZhciB3aWR0aCA9ICh3aW5kb3cuaW5uZXJXaWR0aCAtIGV2ZW50LmNsaWVudFgpO1xyXG5cclxuXHRcdFx0Ly8gRW5mb3JjZSBtaW5pbXVtIGFuZCBtYXhpbXVtIGxpbWl0c1xyXG5cdFx0XHRpZiAod2lkdGggPj0gd2luZG93LmlubmVyV2lkdGggLSBNSU5JTVVNX1dJRFRIKSB7XHJcblx0XHRcdFx0d2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCAtIE1JTklNVU1fV0lEVEg7XHJcblx0XHRcdH0gZWxzZSBpZiAod2lkdGggPD0gTUFYSU1VTV9XSURUSCkge1xyXG5cdFx0XHRcdHdpZHRoID0gTUFYSU1VTV9XSURUSDtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cGFuZS5zdHlsZS53aWR0aCA9IHdpZHRoICsgJ3B4JztcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdC8vIExpc3RlbiB0byBtb3VzZWRvd24gZXZlbnRzIGluIHRoZSBwYWdlIGJvZHksIHRyaWdnZXJpbmcgdGhlIHJlc2l6ZSBtb2RlXHJcblx0Ly8gKGlzUmVzaXppbmcpIGlmIHRoZSBjdXJzb3IgaXMgd2l0aGluIHRoZSByZXNpemUgaGFuZGxlIChjYW5SZXNpemUpLiBUaGVcclxuXHQvLyBjbGFzcyBhZGRlZCB0byB0aGUgcGFnZSBib2R5IHN0eWxlcyBpdCB0byBkaXNhYmxlIHRleHQgc2VsZWN0aW9uIHdoaWxlIHRoZVxyXG5cdC8vIHVzZXIgZHJhZ2dpbmcgdGhlIG1vdXNlIHRvIHJlc2l6ZSB0aGUgcGFuZVxyXG5cdGZ1bmN0aW9uIG9uTW91c2VEb3duKCkge1xyXG5cdFx0aWYgKGNhblJlc2l6ZSkge1xyXG5cdFx0XHRpc1Jlc2l6aW5nID0gdHJ1ZTtcclxuXHRcdFx0Ym9keS5jbGFzc0xpc3QuYWRkKCduZ2ktcmVzaXppbmcnKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cclxuXHQvLyBMaXN0ZW4gdG8gbW91c2V1cCBldmVudHMgb24gdGhlIHBhZ2UsIHR1cm5pbmcgb2ZmIHRoZSByZXNpemUgbW9kZSBpZiBvbmVcclxuXHQvLyBpcyB1bmRlcndheS4gVGhlIGluc3BlY3RvciB3aWR0aCBpcyB0aGVuIHBlcnNpc3RlZCBpbiB0aGUgbG9jYWxTdG9yYWdlXHJcblx0ZnVuY3Rpb24gb25Nb3VzZVVwKCkge1xyXG5cdFx0aWYgKGlzUmVzaXppbmcpIHtcclxuXHRcdFx0aXNSZXNpemluZyA9IGZhbHNlO1xyXG5cdFx0XHRib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ25naS1yZXNpemluZycpO1xyXG5cdFx0XHRsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnbmctaW5zcGVjdG9yLXdpZHRoJywgcGFuZS5vZmZzZXRXaWR0aCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvLyBJZiB0aGUgdXNlciBjb250cmFjdHMgdGhlIHdpbmRvdywgdGhpcyBtYWtlcyBzdXJlIHRoZSBwYW5lIHdvbid0IGVuZCB1cFxyXG5cdC8vIHdpZGVyIHRoYW50IHRoZSB2aWV3cG9ydFxyXG5cdGZ1bmN0aW9uIG9uUmVzaXplKCkge1xyXG5cdFx0aWYgKHBhbmUub2Zmc2V0V2lkdGggPj0gYm9keS5vZmZzZXRXaWR0aCAtIE1JTklNVU1fV0lEVEgpIHtcclxuXHRcdFx0cGFuZS5zdHlsZS53aWR0aCA9IChib2R5Lm9mZnNldFdpZHRoIC0gTUlOSU1VTV9XSURUSCkgKyAncHgnO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Ly8gQ2FuIHBlcmZvcm0gYSBtYXBwaW5nIG9mIGV2ZW50cy9mdW5jdGlvbnMgdG8gYWRkRXZlbnRMaXN0ZW5lclxyXG5cdC8vIG9yIHJlbW92ZUV2ZW50TGlzdGVuZXIsIHRvIHByZXZlbnQgY29kZSBkdXBsaWNhdGlvbiB3aGVuIGJ1bGsgYWRkaW5nL3JlbW92aW5nXHJcblx0ZnVuY3Rpb24gZXZlbnRMaXN0ZW5lckJ1bGsoZXZlbnRzT2JqLCByZW1vdmUpIHtcclxuXHRcdHZhciBldmVudExpc3RlbmVyRnVuYyA9IHJlbW92ZSA/ICdyZW1vdmVFdmVudExpc3RlbmVyJyA6ICdhZGRFdmVudExpc3RlbmVyJztcclxuXHRcdE9iamVjdC5rZXlzKGV2ZW50c09iaikuZm9yRWFjaChmdW5jdGlvbihldmVudCkge1xyXG5cdFx0XHRldmVudHNPYmpbZXZlbnRdLnRhcmdldFtldmVudExpc3RlbmVyRnVuY10oZXZlbnQsIGV2ZW50c09ialtldmVudF0uZm4pO1xyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxufTsiLCJ2YXIgTkdJID0ge1xyXG5cdFRyZWVWaWV3OiByZXF1aXJlKCcuL1RyZWVWaWV3JyksXHJcblx0TW9kZWxNaXhpbjogcmVxdWlyZSgnLi9Nb2RlbE1peGluJyksXHJcblx0VXRpbHM6IHJlcXVpcmUoJy4vVXRpbHMnKVxyXG59O1xyXG5cclxuZnVuY3Rpb24gTW9kZWwoa2V5LCB2YWx1ZSwgZGVwdGgpIHtcclxuXHJcblx0dGhpcy5rZXkgPSBrZXk7XHJcblx0dGhpcy52YWx1ZSA9IHZhbHVlO1xyXG5cdHRoaXMubmdpVHlwZSA9ICdNb2RlbCc7XHJcblxyXG5cdC8vVE9ETyBjaGVjayBmb3IgbWVtb3J5IGxlYWtzXHJcblx0dGhpcy52aWV3ID0gTkdJLlRyZWVWaWV3Lm1vZGVsSXRlbSh0aGlzLCBkZXB0aCk7XHJcblxyXG5cdHZhciB2YWxTcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cdHZhbFNwYW4uY2xhc3NOYW1lID0gJ25naS12YWx1ZSc7XHJcblxyXG5cdE5HSS5Nb2RlbE1peGluLmV4dGVuZCh0aGlzKTtcclxuXHJcblx0dGhpcy5zZXRWYWx1ZSA9IGZ1bmN0aW9uKG5ld1ZhbHVlKSB7XHJcblxyXG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlID0gbmV3VmFsdWU7XHJcblxyXG5cdFx0Ly8gU3RyaW5nXHJcblx0XHRpZiAoYW5ndWxhci5pc1N0cmluZyh2YWx1ZSkpIHtcclxuXHRcdFx0dGhpcy52aWV3LnNldFR5cGUoJ25naS1tb2RlbC1zdHJpbmcnKTtcclxuXHRcdFx0aWYgKHZhbHVlLnRyaW0oKS5sZW5ndGggPiAyNSkge1xyXG5cdFx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAnXCInICsgdmFsdWUudHJpbSgpLnN1YnN0cigwLCAyNSkgKyAnICguLi4pXCInO1xyXG5cdFx0XHRcdHRoaXMudmlldy5zZXRJbmRpY2F0b3IodmFsdWUubGVuZ3RoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJ1wiJyArIHZhbHVlLnRyaW0oKSArICdcIic7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHQvLyBGdW5jdGlvblxyXG5cdFx0ZWxzZSBpZiAoYW5ndWxhci5pc0Z1bmN0aW9uKHZhbHVlKSkge1xyXG5cdFx0XHR0aGlzLnZpZXcuc2V0VHlwZSgnbmdpLW1vZGVsLWZ1bmN0aW9uJyk7XHJcblx0XHRcdHZhciBhcmdzID0gTkdJLlV0aWxzLmFubm90YXRlKHZhbHVlKS5qb2luKCcsICcpO1xyXG5cdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJ2Z1bmN0aW9uKCcgKyBhcmdzICsgJykgey4uLn0nO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIENpcmN1bGFyXHJcblx0XHRlbHNlIGlmIChkZXB0aC5pbmRleE9mKHZhbHVlKSA+PSAwKSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtY2lyY3VsYXInKTtcclxuXHRcdFx0dmFsU3Bhbi50ZXh0Q29udGVudCA9ICdjaXJjdWxhciByZWZlcmVuY2UnO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIE5VTExcclxuXHRcdGVsc2UgaWYgKHZhbHVlID09PSBudWxsKSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtbnVsbCcpO1xyXG5cdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJ251bGwnO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIEFycmF5XHJcblx0XHRlbHNlIGlmIChhbmd1bGFyLmlzQXJyYXkodmFsdWUpKSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtYXJyYXknKTtcclxuXHRcdFx0dmFyIGxlbmd0aCA9IHZhbHVlLmxlbmd0aDtcclxuXHRcdFx0aWYgKGxlbmd0aCA9PT0gMCkge1xyXG5cdFx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAnWyBdJztcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJ1suLi5dJztcclxuXHRcdFx0XHR0aGlzLnZpZXcuc2V0SW5kaWNhdG9yKGxlbmd0aCk7XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy52aWV3Lm1ha2VDb2xsYXBzaWJsZSh0cnVlLCB0cnVlKTtcclxuXHRcdFx0dGhpcy51cGRhdGUodmFsdWUsIGRlcHRoLmNvbmNhdChbdGhpcy52YWx1ZV0pLCBNb2RlbCk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gRE9NIEVsZW1lbnRcclxuXHRcdGVsc2UgaWYgKGFuZ3VsYXIuaXNFbGVtZW50KHZhbHVlKSkge1xyXG5cdFx0XHR0aGlzLnZpZXcuc2V0VHlwZSgnbmdpLW1vZGVsLWVsZW1lbnQnKTtcclxuXHRcdFx0dmFsU3Bhbi50ZXh0Q29udGVudCA9ICc8JyArIHZhbHVlLnRhZ05hbWUgKyAnPic7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gT2JqZWN0XHJcblx0XHRlbHNlIGlmIChhbmd1bGFyLmlzT2JqZWN0KHZhbHVlKSkge1xyXG5cdFx0XHR0aGlzLnZpZXcuc2V0VHlwZSgnbmdpLW1vZGVsLW9iamVjdCcpO1xyXG5cdFx0XHR2YXIgbGVuZ3RoID0gT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aDtcclxuXHRcdFx0aWYgKGxlbmd0aCA9PT0gMCkge1xyXG5cdFx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSAneyB9JztcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJ3suLi59JztcclxuXHRcdFx0XHR0aGlzLnZpZXcuc2V0SW5kaWNhdG9yKGxlbmd0aCk7XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy52aWV3Lm1ha2VDb2xsYXBzaWJsZSh0cnVlLCB0cnVlKTtcclxuXHRcdFx0dGhpcy51cGRhdGUodmFsdWUsIGRlcHRoLmNvbmNhdChbdGhpcy52YWx1ZV0pLCBNb2RlbCk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gQm9vbGVhblxyXG5cdFx0ZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcclxuXHRcdFx0dGhpcy52aWV3LnNldFR5cGUoJ25naS1tb2RlbC1ib29sZWFuJyk7XHJcblx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSB2YWx1ZTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBOdW1iZXJcclxuXHRcdGVsc2UgaWYgKGFuZ3VsYXIuaXNOdW1iZXIodmFsdWUpKSB7XHJcblx0XHRcdHRoaXMudmlldy5zZXRUeXBlKCduZ2ktbW9kZWwtbnVtYmVyJyk7XHJcblx0XHRcdHZhbFNwYW4udGV4dENvbnRlbnQgPSB2YWx1ZTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBVbmRlZmluZWRcclxuXHRcdGVsc2Uge1xyXG5cdFx0XHR0aGlzLnZpZXcuc2V0VHlwZSgnbmdpLW1vZGVsLXVuZGVmaW5lZCcpO1xyXG5cdFx0XHR2YWxTcGFuLnRleHRDb250ZW50ID0gJ3VuZGVmaW5lZCc7XHJcblx0XHR9XHJcblxyXG5cdH07XHJcblx0dGhpcy5zZXRWYWx1ZSh2YWx1ZSk7XHJcblxyXG5cdHRoaXMudmlldy5sYWJlbC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcclxuXHR0aGlzLnZpZXcubGFiZWwuYXBwZW5kQ2hpbGQodmFsU3Bhbik7XHJcbn1cclxuXHJcbk1vZGVsLmluc3RhbmNlID0gZnVuY3Rpb24oa2V5LCB2YWx1ZSwgZGVwdGgpIHtcclxuXHRyZXR1cm4gbmV3IE1vZGVsKGtleSwgdmFsdWUsIGRlcHRoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTW9kZWw7XHJcbiIsImZ1bmN0aW9uIGdldFVzZXJEZWZpbmVkS2V5cyh2YWx1ZXMpIHtcclxuXHRyZXR1cm4gT2JqZWN0LmtleXModmFsdWVzKS5maWx0ZXIoZnVuY3Rpb24oa2V5KSB7XHJcblx0XHRyZXR1cm4gIWlzUHJpdmF0ZUFuZ3VsYXJQcm9wKGtleSk7XHJcblx0fSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzUHJpdmF0ZUFuZ3VsYXJQcm9wKHByb3BOYW1lKSB7XHJcblx0dmFyIFBSSVZBVEVfS0VZX0JMQUNLTElTVCA9IFsnJHBhcmVudCcsICckcm9vdCcsICckaWQnXTtcclxuXHR2YXIgQU5HVUxBUl9QUklWQVRFX1BSRUZJWCA9ICckJCc7XHJcblx0dmFyIGZpcnN0VHdvQ2hhcnMgPSBwcm9wTmFtZVswXSArIHByb3BOYW1lWzFdO1xyXG5cclxuXHRpZiAoZmlyc3RUd29DaGFycyA9PT0gQU5HVUxBUl9QUklWQVRFX1BSRUZJWCkgcmV0dXJuIHRydWU7XHJcblx0aWYgKFBSSVZBVEVfS0VZX0JMQUNLTElTVC5pbmRleE9mKHByb3BOYW1lKSA+IC0xIHx8IHByb3BOYW1lID09PSAndGhpcycpIHJldHVybiB0cnVlO1xyXG5cdHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gYXJyYXlEaWZmKGEsIGIpIHtcclxuXHR2YXIgaSwgcmV0ID0geyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBleGlzdGluZzogW10gfTtcclxuXHJcblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGIgY2hlY2tpbmcgZm9yIGFkZGVkIGFuZCBleGlzdGluZyBlbGVtZW50c1xyXG5cdGZvciAoaSA9IDA7IGkgPCBiLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRpZiAoYS5pbmRleE9mKGJbaV0pIDwgMCkge1xyXG5cdFx0XHRyZXQuYWRkZWQucHVzaChiW2ldKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHJldC5leGlzdGluZy5wdXNoKGJbaV0pO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGEgY2hlY2tpbmcgZm9yIHJlbW92ZWQgZWxlbWVudHNcclxuXHRmb3IgKGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xyXG5cdFx0aWYgKGIuaW5kZXhPZihhW2ldKSA8IDApIHtcclxuXHRcdFx0cmV0LnJlbW92ZWQucHVzaChhW2ldKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiByZXQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIE1vZGVsTWl4aW4oKSB7fVxyXG5cclxuTW9kZWxNaXhpbi51cGRhdGUgPSBmdW5jdGlvbih2YWx1ZXMsIGRlcHRoLCBNb2RlbCkge1xyXG5cclxuXHRpZiAodHlwZW9mIHRoaXMubW9kZWxPYmpzID09PSAndW5kZWZpbmVkJykgdGhpcy5tb2RlbE9ianMgPSB7fTtcclxuXHRpZiAodHlwZW9mIHRoaXMubW9kZWxLZXlzID09PSAndW5kZWZpbmVkJykgdGhpcy5tb2RlbEtleXMgPSBbXTtcclxuXHJcblx0dmFyIG5ld0tleXMgPSBnZXRVc2VyRGVmaW5lZEtleXModmFsdWVzKSxcclxuXHRcdFx0ZGlmZiA9IGFycmF5RGlmZih0aGlzLm1vZGVsS2V5cywgbmV3S2V5cyksXHJcblx0XHRcdGksIGtleTtcclxuXHJcblx0Ly8gUmVtb3ZlZCBrZXlzXHJcblx0Zm9yIChpID0gMDsgaSA8IGRpZmYucmVtb3ZlZC5sZW5ndGg7IGkrKykge1xyXG5cdFx0dmFyIGtleSA9IGRpZmYucmVtb3ZlZFtpXTtcclxuXHRcdHRoaXMubW9kZWxPYmpzW2tleV0udmlldy5kZXN0cm95KCk7XHJcblx0XHRkZWxldGUgdGhpcy5tb2RlbE9ianNba2V5XTtcclxuXHR9XHJcblx0XHJcblx0Ly8gTmV3IGtleXNcclxuXHRmb3IgKGkgPSAwOyBpIDwgZGlmZi5hZGRlZC5sZW5ndGg7IGkrKykge1xyXG5cdFx0a2V5ID0gZGlmZi5hZGRlZFtpXTtcclxuXHRcdHRoaXMubW9kZWxPYmpzW2tleV0gPSBNb2RlbC5pbnN0YW5jZShrZXksIHZhbHVlc1trZXldLCBkZXB0aC5jb25jYXQoW3ZhbHVlc10pKTtcclxuXHRcdHZhciBpbnNlcnRBdFRvcCA9IHRoaXMubmdpVHlwZSA9PT0gJ1Njb3BlJztcclxuXHRcdHRoaXMudmlldy5hZGRDaGlsZCh0aGlzLm1vZGVsT2Jqc1trZXldLnZpZXcsIGluc2VydEF0VG9wKTtcclxuXHR9XHJcblxyXG5cdC8vIFVwZGF0ZWQga2V5c1xyXG5cdGZvciAoaSA9IDA7IGkgPCBkaWZmLmV4aXN0aW5nLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRrZXkgPSBkaWZmLmV4aXN0aW5nW2ldO1xyXG5cdFx0aWYgKCF0aGlzLm1vZGVsT2Jqc1trZXldKSB7XHJcblx0XHRcdHZhciBpbnN0ID0gdGhpcy5uZ2lUeXBlID09PSAnU2NvcGUnID8gJ1Njb3BlJyA6IHRoaXMubmdpVHlwZSA9PT0gJ01vZGVsJyA/ICdNb2RlbCcgOiAnVU5LTk9XTiBJTlNUQU5DRSc7XHJcblx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5tb2RlbE9ianNba2V5XS5zZXRWYWx1ZSh2YWx1ZXNba2V5XSk7XHJcblx0fVxyXG5cclxuXHR0aGlzLm1vZGVsS2V5cyA9IG5ld0tleXM7XHJcbn07XHJcblxyXG5Nb2RlbE1peGluLmV4dGVuZCA9IGZ1bmN0aW9uKG9iaikge1xyXG5cdG9iai51cGRhdGUgPSBNb2RlbE1peGluLnVwZGF0ZS5iaW5kKG9iaik7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE1vZGVsTWl4aW47XHJcbiIsInZhciBOR0kgPSB7XHJcblx0U2VydmljZTogcmVxdWlyZSgnLi9TZXJ2aWNlJylcclxufTtcclxuXHJcbmZ1bmN0aW9uIE1vZHVsZShhcHAsIG5hbWUpIHtcclxuXHJcblx0Ly8gVGhlIEFuZ3VsYXJKUyBtb2R1bGUgbmFtZVxyXG5cdHRoaXMubmFtZSA9IG5hbWU7XHJcblxyXG5cdC8vIEFycmF5IHdpdGggYE5HSS5Nb2R1bGVgIGluc3RhbmNlIHJlZmVyZW5jZXNcclxuXHR0aGlzLnJlcXVpcmVzID0gW107XHJcblxyXG5cdC8vIFRoZSBBbmd1bGFySlMgbW9kdWxlIGluc3RhbmNlXHJcblx0dGhpcy5uZ01vZHVsZSA9IHdpbmRvdy5hbmd1bGFyLm1vZHVsZShuYW1lKTtcclxuXHJcblx0Ly8gYE5HSS5TZXJ2aWNlYCBpbnN0YW5jZXMgcmVwcmVzZW50aW5nIHNlcnZpY2VzIGRlZmluZWQgaW4gdGhpcyBtb2R1bGVcclxuXHR0aGlzLnNlcnZpY2VzID0gTkdJLlNlcnZpY2UucGFyc2VRdWV1ZShhcHAsIHRoaXMubmdNb2R1bGUpO1xyXG59XHJcblxyXG4vLyBBIGNhY2hlIHdpdGggYWxsIE5HSS5Nb2R1bGUgaW5zdGFuY2VzXHJcbnZhciBtb2R1bGVDYWNoZSA9IFtdO1xyXG5cclxuTW9kdWxlLnJlZ2lzdGVyID0gZnVuY3Rpb24oYXBwLCBuYW1lKSB7XHJcblx0Ly8gRW5zdXJlIG9ubHkgYSBzaW5nbGUgYE5HSS5Nb2R1bGVgIGluc3RhbmNlIGV4aXN0cyBmb3IgZWFjaCBBbmd1bGFySlNcclxuXHQvLyBtb2R1bGUgbmFtZVxyXG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gdHlwZW9mICcnICYmICFtb2R1bGVDYWNoZVtuYW1lXSkge1xyXG5cdFx0bW9kdWxlQ2FjaGVbbmFtZV0gPSBuZXcgTW9kdWxlKGFwcCwgbmFtZSk7XHJcblxyXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGRlcGVuZGVuY2llc1xyXG5cdFx0dmFyIHJlcXVpcmVzID0gbW9kdWxlQ2FjaGVbbmFtZV0ubmdNb2R1bGUucmVxdWlyZXM7XHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHJlcXVpcmVzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdHZhciBkZXBlbmRlbmN5ID0gTW9kdWxlLnJlZ2lzdGVyKGFwcCwgcmVxdWlyZXNbaV0pO1xyXG5cdFx0XHRtb2R1bGVDYWNoZVtuYW1lXS5yZXF1aXJlcy5wdXNoKGRlcGVuZGVuY3kpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmV0dXJuIG1vZHVsZUNhY2hlW25hbWVdO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNb2R1bGU7XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY29tbWFuZCwgcGF5bG9hZCwgb3JpZ2luKSB7XHJcbiAgICB2YXIgbXNnID0gSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGNvbW1hbmQ6IGNvbW1hbmQsXHJcbiAgICAgICAgcGF5bG9hZDogcGF5bG9hZFxyXG4gICAgfSk7XHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2UobXNnLCBvcmlnaW4gfHwgJyonKTtcclxufTsiLCJ2YXIgTkdJID0ge1xyXG5cdFRyZWVWaWV3OiByZXF1aXJlKCcuL1RyZWVWaWV3JyksXHJcblx0TW9kZWxNaXhpbjogcmVxdWlyZSgnLi9Nb2RlbE1peGluJyksXHJcblx0SW5zcGVjdG9yQWdlbnQ6IHJlcXVpcmUoJy4vSW5zcGVjdG9yQWdlbnQnKSxcclxuXHRNb2RlbDogcmVxdWlyZSgnLi9Nb2RlbCcpXHJcbn07XHJcblxyXG5mdW5jdGlvbiBTY29wZShhcHAsIG5nU2NvcGUsIGlzSXNvbGF0ZSkge1xyXG5cclxuXHR2YXIgYW5ndWxhciA9IHdpbmRvdy5hbmd1bGFyO1xyXG5cclxuXHR0aGlzLmFwcCA9IGFwcDtcclxuXHR0aGlzLm5nU2NvcGUgPSBuZ1Njb3BlO1xyXG5cdHRoaXMubmdpVHlwZSA9ICdTY29wZSc7XHJcblxyXG5cdC8vIENhbGN1bGF0ZSB0aGUgc2NvcGUgZGVwdGggaW4gdGhlIHRyZWUgdG8gZGV0ZXJtaW5lIHRoZSBpbnRlbmRhdGlvbiBsZXZlbFxyXG5cdC8vIGluIHRoZSBUcmVlVmlld1xyXG5cdHZhciByZWZlcmVuY2UgPSBuZ1Njb3BlO1xyXG5cdHZhciBkZXB0aCA9IFtyZWZlcmVuY2VdO1xyXG5cdHdoaWxlIChyZWZlcmVuY2UgPSByZWZlcmVuY2UuJHBhcmVudCkgeyBkZXB0aC5wdXNoKHJlZmVyZW5jZSk7IH1cclxuXHJcblx0Ly8gSW5zdGFudGlhdGUgYW5kIGV4cG9zZSB0aGUgVHJlZVZpZXdJdGVtIHJlcHJlc2VudGluZyB0aGUgc2NvcGVcclxuXHR2YXIgdmlldyA9IHRoaXMudmlldyA9IE5HSS5UcmVlVmlldy5zY29wZUl0ZW0obmdTY29wZS4kaWQsIGRlcHRoLCBpc0lzb2xhdGUpO1xyXG5cdGlmIChpc0lzb2xhdGUpIHRoaXMudmlldy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ25naS1pc29sYXRlLXNjb3BlJyk7XHJcblxyXG5cdC8vIENhbGxlZCB3aGVuIHRoZSBgTkdJLkluc3BlY3RvckFnZW50YCBET00gdHJhdmVyc2FsIGZpbmRzIGEgTm9kZSBtYXRjaFxyXG5cdC8vIGZvciB0aGUgc2NvcGVcclxuXHR0aGlzLnNldE5vZGUgPSBmdW5jdGlvbihub2RlKSB7XHJcblx0XHR0aGlzLm5vZGUgPSB0aGlzLnZpZXcubm9kZSA9IG5vZGU7XHJcblx0fTtcclxuXHJcblx0ZnVuY3Rpb24gY2hpbGRTY29wZUlkcygpIHtcclxuXHRcdGlmICghbmdTY29wZS4kJGNoaWxkSGVhZCkgcmV0dXJuIFtdO1xyXG5cdFx0dmFyIGNoaWxkS2V5cyA9IFtdO1xyXG5cdFx0dmFyIGNoaWxkU2NvcGUgPSBuZ1Njb3BlLiQkY2hpbGRIZWFkO1xyXG5cdFx0ZG8ge1xyXG5cdFx0XHRjaGlsZEtleXMucHVzaChjaGlsZFNjb3BlLiRpZCk7XHJcblx0XHR9IHdoaWxlIChjaGlsZFNjb3BlID0gY2hpbGRTY29wZS4kJG5leHRTaWJsaW5nKTtcclxuXHRcdHJldHVybiBjaGlsZEtleXM7XHJcblx0fVxyXG5cclxuXHR2YXIgb2xkQ2hpbGRJZHMgPSBjaGlsZFNjb3BlSWRzKCk7XHJcblxyXG5cdHZhciBkZXN0cm95RGVyZWdpc3RlciA9IGFuZ3VsYXIubm9vcDtcclxuXHR2YXIgd2F0Y2hEZXJlZ2lzdGVyID0gYW5ndWxhci5ub29wO1xyXG5cdHZhciBvYnNlcnZlck9uID0gZmFsc2U7XHJcblxyXG5cdE5HSS5Nb2RlbE1peGluLmV4dGVuZCh0aGlzKTtcclxuXHR0aGlzLnVwZGF0ZShuZ1Njb3BlLCBkZXB0aCwgTkdJLk1vZGVsKTtcclxuXHJcblx0dGhpcy5zdGFydE9ic2VydmVyID0gZnVuY3Rpb24oKSB7XHJcblx0XHRpZiAob2JzZXJ2ZXJPbiA9PT0gZmFsc2UpIHtcclxuXHRcdFx0dmFyIHNjb3BlT2JqID0gdGhpcztcclxuXHRcdFx0ZGVzdHJveURlcmVnaXN0ZXIgPSBuZ1Njb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHR2aWV3LmRlc3Ryb3koKTtcclxuXHRcdFx0fSk7XHJcblx0XHRcdHdhdGNoRGVyZWdpc3RlciA9IG5nU2NvcGUuJHdhdGNoKGZ1bmN0aW9uKCkge1xyXG5cclxuXHRcdFx0XHQvLyBTY29wZXM6IGJhc2ljIGNoZWNrIGZvciBtdXRhdGlvbnMgaW4gdGhlIGRpcmVjdCBjaGlsZCBzY29wZSBsaXN0XHJcblx0XHRcdFx0dmFyIG5ld0NoaWxkSWRzID0gY2hpbGRTY29wZUlkcygpO1xyXG5cdFx0XHRcdGlmICghYW5ndWxhci5lcXVhbHMob2xkQ2hpbGRJZHMsIG5ld0NoaWxkSWRzKSkge1xyXG5cdFx0XHRcdFx0TkdJLkluc3BlY3RvckFnZW50Lmluc3BlY3RTY29wZShhcHAsIG5nU2NvcGUpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRvbGRDaGlsZElkcyA9IG5ld0NoaWxkSWRzO1xyXG5cclxuXHRcdFx0XHQvLyBNb2RlbHNcclxuXHRcdFx0XHRzY29wZU9iai51cGRhdGUobmdTY29wZSwgZGVwdGgsIE5HSS5Nb2RlbCk7XHJcblxyXG5cdFx0XHR9KTtcclxuXHRcdFx0b2JzZXJ2ZXJPbiA9IHRydWU7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0dGhpcy5zdG9wT2JzZXJ2ZXIgPSBmdW5jdGlvbigpIHtcclxuXHRcdGlmIChvYnNlcnZlck9uID09PSB0cnVlKSB7XHJcblx0XHRcdGlmICh0eXBlb2YgZGVzdHJveURlcmVnaXN0ZXIgPT09ICdmdW5jdGlvbicpIHtcclxuXHRcdFx0XHRkZXN0cm95RGVyZWdpc3Rlci5hcHBseSgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmICh0eXBlb2Ygd2F0Y2hEZXJlZ2lzdGVyID09PSAnZnVuY3Rpb24nKSB7XHJcblx0XHRcdFx0d2F0Y2hEZXJlZ2lzdGVyLmFwcGx5KCk7XHJcblx0XHRcdH1cclxuXHRcdFx0b2JzZXJ2ZXJPbiA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG59XHJcblxyXG4vLyBUbyBlYXNpbHkgcmV0cmlldmUgYW4gYE5HSS5TY29wZWAgaW5zdGFuY2UgYnkgdGhlIHNjb3BlIGlkLCB3ZSBrZWVwIGFcclxuLy8gY2FjaGUgb2YgY3JlYXRlZCBpbnN0YW5jZXNcclxudmFyIHNjb3BlQ2FjaGUgPSB7fTtcclxuXHJcbi8vIEV4cG9zZSBzdG9wT2JzZXJ2ZXJzIHRvIHN0b3Agb2JzZXJ2ZXJzIGZyb20gYWxsIHNjb3BlcyBpbiBgc2NvcGVDYWNoZWAgd2hlblxyXG4vLyB0aGUgaW5zcGVjdG9yIHBhbmUgaXMgdG9nZ2xlZCBvZmZcclxuU2NvcGUuc3RvcE9ic2VydmVycyA9IGZ1bmN0aW9uKCkge1xyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgc2NvcGVDYWNoZS5sZW5ndGg7IGkrKykge1xyXG5cdFx0c2NvcGVDYWNoZVtpXS5zdG9wT2JzZXJ2ZXIoKTtcclxuXHR9XHJcbn07XHJcblxyXG4vLyBSZXR1cm5zIGFuIGluc3RhbmNlIG9mIGBOR0kuU2NvcGVgIHJlcHJlc2VudGluZyB0aGUgQW5ndWxhckpTIHNjb3BlIHdpdGhcclxuLy8gdGhlIGlkXHJcblNjb3BlLmdldCA9IGZ1bmN0aW9uKGlkKSB7XHJcblx0cmV0dXJuIHNjb3BlQ2FjaGVbaWRdO1xyXG59O1xyXG5cclxuLy8gVGhpcyBpcyB0aGUgbWV0aG9kIHVzZWQgYnkgYE5HSS5JbnNwZWN0b3JBZ2VudGAgdG8gaW5zdGFudGlhdGUgdGhlXHJcbi8vIGBOR0kuU2NvcGVgIG9iamVjdFxyXG5TY29wZS5pbnN0YW5jZSA9IGZ1bmN0aW9uKGFwcCwgbmdTY29wZSwgaXNJc29sYXRlKSB7XHJcblx0aWYgKHNjb3BlQ2FjaGVbbmdTY29wZS4kaWRdKSB7XHJcblx0XHRyZXR1cm4gc2NvcGVDYWNoZVtuZ1Njb3BlLiRpZF07XHJcblx0fVxyXG5cdHZhciBzY29wZSA9IG5ldyBTY29wZShhcHAsIG5nU2NvcGUsIGlzSXNvbGF0ZSk7XHJcblx0c2NvcGVDYWNoZVtuZ1Njb3BlLiRpZF0gPSBzY29wZTtcclxuXHRyZXR1cm4gc2NvcGU7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNjb3BlO1xyXG4iLCJ2YXIgTkdJID0ge1xyXG5cdFV0aWxzOiByZXF1aXJlKCcuL1V0aWxzJylcclxufTtcclxuXHJcbnZhciBDTEFTU19ESVJFQ1RJVkVfUkVHRVhQID0gLygoW1xcZFxcd1xcLV9dKykoPzpcXDooW147XSspKT87PykvO1xyXG5cclxuZnVuY3Rpb24gU2VydmljZShhcHAsIG1vZHVsZSwgaW52b2tlKSB7XHJcblx0dGhpcy5wcm92aWRlciA9IGludm9rZVswXTtcclxuXHR0aGlzLnR5cGUgPSBpbnZva2VbMV07XHJcblx0dGhpcy5kZWZpbml0aW9uID0gaW52b2tlWzJdO1xyXG5cdHRoaXMubmFtZSA9ICh0eXBlb2YgdGhpcy5kZWZpbml0aW9uWzBdID09PSB0eXBlb2YgJycpID8gdGhpcy5kZWZpbml0aW9uWzBdIDogbnVsbDtcclxuXHR0aGlzLmZhY3RvcnkgPSB0aGlzLmRlZmluaXRpb25bMV07XHJcblx0XHJcblx0c3dpdGNoKHRoaXMucHJvdmlkZXIpIHtcclxuXHRcdGNhc2UgJyRjb21waWxlUHJvdmlkZXInOlxyXG5cclxuXHRcdFx0dmFyIGRpcjtcclxuXHJcblx0XHRcdHRyeSB7XHJcblx0XHRcdFx0ZGlyID0gYXBwLiRpbmplY3Rvci5pbnZva2UodGhpcy5mYWN0b3J5KTtcclxuXHRcdFx0fSBjYXRjaChlcnIpIHtcclxuXHRcdFx0XHRyZXR1cm4gY29uc29sZS53YXJuKFxyXG5cdFx0XHRcdFx0J25nLWluc3BlY3RvcjogQW4gZXJyb3Igb2NjdXJyZWQgYXR0ZW1wdGluZyB0byBpbnZva2UgZGlyZWN0aXZlOiAnICtcclxuXHRcdFx0XHRcdCh0aGlzLm5hbWUgfHwgJyh1bmtub3duKScpLFxyXG5cdFx0XHRcdFx0ZXJyXHJcblx0XHRcdFx0KTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKCFkaXIpIGRpciA9IHt9O1xyXG5cdFx0XHR2YXIgcmVzdHJpY3QgPSBkaXIucmVzdHJpY3QgfHwgJ0FFJztcclxuXHRcdFx0dmFyIG5hbWUgPSB0aGlzLm5hbWU7XHJcblxyXG5cdFx0XHRhcHAucmVnaXN0ZXJQcm9iZShmdW5jdGlvbihub2RlLCBzY29wZSwgaXNJc29sYXRlKSB7XHJcblxyXG5cdFx0XHRcdGlmIChub2RlID09PSBkb2N1bWVudCkge1xyXG5cdFx0XHRcdFx0bm9kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdodG1sJylbMF07XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQvLyBUZXN0IGZvciBBdHRyaWJ1dGUgQ29tbWVudCBkaXJlY3RpdmVzICh3aXRoIHJlcGxhY2U6dHJ1ZSBmb3IgdGhlXHJcblx0XHRcdFx0Ly8gbGF0dGVyKVxyXG5cdFx0XHRcdGlmIChyZXN0cmljdC5pbmRleE9mKCdBJykgPiAtMSB8fFxyXG5cdFx0XHRcdFx0KGRpci5yZXBsYWNlID09PSB0cnVlICYmIHJlc3RyaWN0LmluZGV4T2YoJ00nKSA+IC0xKSkge1xyXG5cdFx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBub2RlLmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0XHRcdFx0dmFyIG5vcm1hbGl6ZWQgPSBOR0kuVXRpbHMuZGlyZWN0aXZlTm9ybWFsaXplKG5vZGUuYXR0cmlidXRlc1tpXS5uYW1lKTtcclxuXHRcdFx0XHRcdFx0aWYgKG5vcm1hbGl6ZWQgPT09IG5hbWUpIHtcclxuXHRcdFx0XHRcdFx0XHRpZiAoIWlzSXNvbGF0ZSAmJiBkaXIuc2NvcGUgPT09IHRydWUgfHxcclxuXHRcdFx0XHRcdFx0XHRcdGlzSXNvbGF0ZSAmJiB0eXBlb2YgZGlyLnNjb3BlID09PSB0eXBlb2Yge30pIHtcclxuXHRcdFx0XHRcdFx0XHRcdHNjb3BlLnZpZXcuYWRkQW5ub3RhdGlvbihuYW1lLCBTZXJ2aWNlLkRJUik7XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQvLyBUZXN0IGZvciBFbGVtZW50IGRpcmVjdGl2ZXNcclxuXHRcdFx0XHRpZiAocmVzdHJpY3QuaW5kZXhPZignRScpID4gLTEpIHtcclxuXHRcdFx0XHRcdHZhciBub3JtYWxpemVkID0gTkdJLlV0aWxzLmRpcmVjdGl2ZU5vcm1hbGl6ZShub2RlLnRhZ05hbWUudG9Mb3dlckNhc2UoKSk7XHJcblx0XHRcdFx0XHRpZiAobm9ybWFsaXplZCA9PT0gbmFtZSkge1xyXG5cdFx0XHRcdFx0XHRpZiAoIWlzSXNvbGF0ZSAmJiBkaXIuc2NvcGUgPT09IHRydWUgfHxcclxuXHRcdFx0XHRcdFx0XHRpc0lzb2xhdGUgJiYgdHlwZW9mIGRpci5zY29wZSA9PT0gdHlwZW9mIHt9KSB7XHJcblx0XHRcdFx0XHRcdFx0c2NvcGUudmlldy5hZGRBbm5vdGF0aW9uKG5hbWUsIFNlcnZpY2UuRElSKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Ly8gVGVzdCBmb3IgQ2xhc3MgZGlyZWN0aXZlc1xyXG5cdFx0XHRcdGlmIChyZXN0cmljdC5pbmRleE9mKCdDJykgPiAtMSkge1xyXG5cdFx0XHRcdFx0dmFyIG1hdGNoZXMgPSBDTEFTU19ESVJFQ1RJVkVfUkVHRVhQLmV4ZWMobm9kZS5jbGFzc05hbWUpO1xyXG5cdFx0XHRcdFx0aWYgKG1hdGNoZXMpIHtcclxuXHRcdFx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtYXRjaGVzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdFx0XHRcdFx0aWYgKCFtYXRjaGVzW2ldKSBjb250aW51ZTtcclxuXHRcdFx0XHRcdFx0XHR2YXIgbm9ybWFsaXplZCA9IE5HSS5VdGlscy5kaXJlY3RpdmVOb3JtYWxpemUobWF0Y2hlc1tpXSk7XHJcblx0XHRcdFx0XHRcdFx0aWYgKG5vcm1hbGl6ZWQgPT09IG5hbWUpIHtcclxuXHRcdFx0XHRcdFx0XHRcdGlmICghaXNJc29sYXRlICYmIGRpci5zY29wZSA9PT0gdHJ1ZSB8fFxyXG5cdFx0XHRcdFx0XHRcdFx0XHRpc0lzb2xhdGUgJiYgdHlwZW9mIGRpci5zY29wZSA9PT0gdHlwZW9mIHt9KSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcdHNjb3BlLnZpZXcuYWRkQW5ub3RhdGlvbihuYW1lLCBTZXJ2aWNlLkRJUik7XHJcblx0XHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0fSk7XHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0Y2FzZSAnJGNvbnRyb2xsZXJQcm92aWRlcic6XHJcblxyXG5cdFx0XHRhcHAucmVnaXN0ZXJQcm9iZShmdW5jdGlvbihub2RlLCBzY29wZSkge1xyXG5cclxuXHRcdFx0XHRpZiAobm9kZSA9PT0gZG9jdW1lbnQpIHtcclxuXHRcdFx0XHRcdG5vZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaHRtbCcpWzBdO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Ly8gVGVzdCBmb3IgdGhlIHByZXNlbmNlIG9mIHRoZSBuZ0NvbnRyb2xsZXIgZGlyZWN0aXZlXHJcblx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBub2RlLmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0XHRcdHZhciBub3JtYWxpemVkID0gTkdJLlV0aWxzLmRpcmVjdGl2ZU5vcm1hbGl6ZShub2RlLmF0dHJpYnV0ZXNbaV0ubmFtZSk7XHJcblx0XHRcdFx0XHRpZiAobm9ybWFsaXplZCA9PT0gJ25nQ29udHJvbGxlcicpIHtcclxuXHRcdFx0XHRcdFx0c2NvcGUudmlldy5hZGRBbm5vdGF0aW9uKG5vZGUuYXR0cmlidXRlc1tpXS52YWx1ZSwgU2VydmljZS5DVFJMKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHR9KTtcclxuXHJcblx0XHRcdGJyZWFrO1xyXG5cdH1cclxufVxyXG5cclxuU2VydmljZS5DVFJMID0gMTtcclxuU2VydmljZS5ESVIgPSAyO1xyXG5TZXJ2aWNlLkJVSUxUSU4gPSA0O1xyXG5cclxuU2VydmljZS5wYXJzZVF1ZXVlID0gZnVuY3Rpb24oYXBwLCBtb2R1bGUpIHtcclxuXHR2YXIgYXJyID0gW10sXHJcblx0XHRcdHF1ZXVlID0gbW9kdWxlLl9pbnZva2VRdWV1ZSxcclxuXHRcdFx0dGVtcFF1ZXVlLCBpLCBqO1xyXG5cdGZvciAoaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xyXG5cdFx0aWYgKHF1ZXVlW2ldWzJdLmxlbmd0aCA9PT0gMSAmJiAhKHF1ZXVlW2ldWzJdWzBdIGluc3RhbmNlb2YgQXJyYXkpKSB7XHJcblx0XHRcdGZvciAoaiBpbiBxdWV1ZVtpXVsyXVswXSkge1xyXG5cdFx0XHRcdGlmIChPYmplY3QuaGFzT3duUHJvcGVydHkuY2FsbChxdWV1ZVtpXVsyXVswXSwgaikpIHtcclxuXHRcdFx0XHRcdHRlbXBRdWV1ZSA9IHF1ZXVlW2ldLnNsaWNlKCk7XHJcblx0XHRcdFx0XHR0ZW1wUXVldWVbMl0gPSBbT2JqZWN0LmtleXMocXVldWVbaV1bMl1bMF0pW2pdLCBxdWV1ZVtpXVsyXVswXVtqXV07XHJcblx0XHRcdFx0XHRhcnIucHVzaChuZXcgU2VydmljZShhcHAsIG1vZHVsZSwgdGVtcFF1ZXVlKSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRhcnIucHVzaChuZXcgU2VydmljZShhcHAsIG1vZHVsZSwgcXVldWVbaV0pKTtcclxuXHRcdH1cclxuXHR9XHJcblx0cmV0dXJuIGFycjtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2VydmljZTtcclxuIiwidmFyIE5HSSA9IHtcclxuXHRTZXJ2aWNlOiByZXF1aXJlKCcuL1NlcnZpY2UnKSxcclxuXHRIaWdobGlnaHRlcjogcmVxdWlyZSgnLi9IaWdobGlnaHRlcicpXHJcbn07XHJcblxyXG5mdW5jdGlvbiBUcmVlVmlld0l0ZW0obGFiZWwpIHtcclxuXHJcblx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcblxyXG5cdC8vIFN0b3JlIHJlZmVyZW5jZSB0byBpdHNlbGYuIE5lZWRlZCBmb3IgZGVsZWdhdGVkIG1vdXNlb3ZlclxyXG5cdHRoaXMuZWxlbWVudC5pdGVtID0gdGhpcztcclxuXHJcblx0Ly8gQWNjZXB0cyBhIGxhYmVsIERPTSBOb2RlIG9yIGEgc3RyaW5nXHJcblx0aWYgKHR5cGVvZiBsYWJlbCA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGxhYmVsID09PSAnbnVtYmVyJykge1xyXG5cdFx0dGhpcy5sYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xhYmVsJyk7XHJcblx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gbGFiZWw7XHJcblx0fSBlbHNlIGlmICghIWxhYmVsLnRhZ05hbWUpIHtcclxuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcclxuXHR9XHJcblx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMubGFiZWwpO1xyXG5cclxuXHR0aGlzLmRyYXdlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdHRoaXMuZHJhd2VyLmNsYXNzTmFtZSA9ICduZ2ktZHJhd2VyJztcclxuXHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5kcmF3ZXIpO1xyXG5cclxuXHR0aGlzLmNhcmV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cdHRoaXMuY2FyZXQuY2xhc3NOYW1lID0gJ25naS1jYXJldCc7XHJcblxyXG5cdHRoaXMubGVuZ3RoID0gbnVsbDtcclxuXHJcblx0dmFyIGNvbGxhcHNlZCA9IGZhbHNlO1xyXG5cdHRoaXMuc2V0Q29sbGFwc2VkID0gZnVuY3Rpb24obmV3U3RhdGUpIHtcclxuXHRcdGlmIChjb2xsYXBzZWQgPSBuZXdTdGF0ZSkge1xyXG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbmdpLWNvbGxhcHNlZCcpO1xyXG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnbmdpLWV4cGFuZGVkJyk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnbmdpLWNvbGxhcHNlZCcpO1xyXG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbmdpLWV4cGFuZGVkJyk7XHJcblx0XHR9XHJcblx0fTtcclxuXHR0aGlzLnRvZ2dsZSA9IGZ1bmN0aW9uKGUpIHtcclxuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblx0XHR0aGlzLnNldENvbGxhcHNlZCghY29sbGFwc2VkKTtcclxuXHR9O1xyXG5cdHRoaXMuY2FyZXQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLnRvZ2dsZS5iaW5kKHRoaXMpKTtcclxuXHJcblx0dmFyIGlzQ29sbGFwc2libGUgPSBmYWxzZTtcclxuXHR0aGlzLm1ha2VDb2xsYXBzaWJsZSA9IGZ1bmN0aW9uKGNvbGxhcHNpYmxlU3RhdGUsIGluaXRpYWxTdGF0ZSkge1xyXG5cdFx0aWYgKGlzQ29sbGFwc2libGUgPT0gY29sbGFwc2libGVTdGF0ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRpZiAoaXNDb2xsYXBzaWJsZSA9IGNvbGxhcHNpYmxlU3RhdGUpIHtcclxuXHRcdFx0dGhpcy5sYWJlbC5hcHBlbmRDaGlsZCh0aGlzLmNhcmV0KTtcclxuXHRcdFx0dGhpcy5zZXRDb2xsYXBzZWQoaW5pdGlhbFN0YXRlIHx8IGZhbHNlKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMubGFiZWwucmVtb3ZlQ2hpbGQodGhpcy5jYXJldCk7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0dGhpcy5hZGRDaGlsZCA9IGZ1bmN0aW9uKGNoaWxkSXRlbSwgdG9wKSB7XHJcblx0XHRpZiAoISF0b3ApIHtcclxuXHRcdFx0dGhpcy5kcmF3ZXIuaW5zZXJ0QmVmb3JlKGNoaWxkSXRlbS5lbGVtZW50LCB0aGlzLmRyYXdlci5maXJzdENoaWxkKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuZHJhd2VyLmFwcGVuZENoaWxkKGNoaWxkSXRlbS5lbGVtZW50KTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHR0aGlzLnJlbW92ZUNoaWxkcmVuID0gZnVuY3Rpb24oY2xhc3NOYW1lKSB7XHJcblx0XHRmb3IgKHZhciBpID0gdGhpcy5kcmF3ZXIuY2hpbGROb2Rlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHR2YXIgY2hpbGQgPSB0aGlzLmRyYXdlci5jaGlsZE5vZGVzW2ldO1xyXG5cdFx0XHRpZiAoY2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKGNsYXNzTmFtZSkpIHtcclxuXHRcdFx0XHR0aGlzLmRyYXdlci5yZW1vdmVDaGlsZChjaGlsZCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHR0aGlzLmRlc3Ryb3kgPSBmdW5jdGlvbigpIHtcclxuXHRcdGlmICh0aGlzLmVsZW1lbnQucGFyZW50Tm9kZSkge1xyXG5cdFx0XHR0aGlzLmVsZW1lbnQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmVsZW1lbnQpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdC8vIFBpbGwgaW5kaWNhdG9yXHJcblx0dmFyIGluZGljYXRvciA9IGZhbHNlO1xyXG5cdHRoaXMuc2V0SW5kaWNhdG9yID0gZnVuY3Rpb24odmFsdWUpIHtcclxuXHRcdGlmIChpbmRpY2F0b3IgJiYgdHlwZW9mIHZhbHVlICE9PSAnbnVtYmVyJyAmJiB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XHJcblx0XHRcdGluZGljYXRvci5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGluZGljYXRvcik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRpZiAoIWluZGljYXRvcikge1xyXG5cdFx0XHRcdGluZGljYXRvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHRcdFx0XHRpbmRpY2F0b3IuY2xhc3NOYW1lID0gJ25naS1pbmRpY2F0b3InO1xyXG5cdFx0XHRcdGluZGljYXRvci50ZXh0Q29udGVudCA9IHZhbHVlO1xyXG5cdFx0XHRcdHRoaXMubGFiZWwuYXBwZW5kQ2hpbGQoaW5kaWNhdG9yKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdC8vIEFubm90YXRpb25zIChjb250cm9sbGVyIG5hbWVzLCBjdXN0b20gYW5kIGJ1aWx0LWluIGRpcmVjdGl2ZSBuYW1lcylcclxuXHR2YXIgYW5ub3RhdGlvbnMgPSBbXTtcclxuXHR0aGlzLmFkZEFubm90YXRpb24gPSBmdW5jdGlvbihuYW1lLCB0eXBlKSB7XHJcblx0XHRpZiAoYW5ub3RhdGlvbnMuaW5kZXhPZihuYW1lKSA8IDApIHtcclxuXHRcdFx0YW5ub3RhdGlvbnMucHVzaChuYW1lKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHZhciBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cdFx0c3Bhbi5jbGFzc05hbWUgPSAnbmdpLWFubm90YXRpb24nO1xyXG5cdFx0c3Bhbi50ZXh0Q29udGVudCA9IG5hbWU7XHJcblx0XHRzd2l0Y2godHlwZSkge1xyXG5cdFx0XHRjYXNlIE5HSS5TZXJ2aWNlLkRJUjpcclxuXHRcdFx0XHRzcGFuLmNsYXNzTGlzdC5hZGQoJ25naS1hbm5vdGF0aW9uLWRpcicpO1xyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRjYXNlIE5HSS5TZXJ2aWNlLkJVSUxUSU46XHJcblx0XHRcdFx0c3Bhbi5jbGFzc0xpc3QuYWRkKCduZ2ktYW5ub3RhdGlvbi1idWlsdGluJyk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdGNhc2UgTkdJLlNlcnZpY2UuQ1RSTDpcclxuXHRcdFx0XHRzcGFuLmNsYXNzTGlzdC5hZGQoJ25naS1hbm5vdGF0aW9uLWN0cmwnKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdH1cclxuXHRcdHRoaXMubGFiZWwuYXBwZW5kQ2hpbGQoc3Bhbik7XHJcblx0fTtcclxuXHJcblx0Ly8gTW9kZWwgdHlwZXNcclxuXHR2YXIgdHlwZSA9IG51bGw7XHJcblx0dGhpcy5zZXRUeXBlID0gZnVuY3Rpb24obmV3VHlwZSkge1xyXG5cdFx0aWYgKHR5cGUpIHtcclxuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUodHlwZSk7XHJcblx0XHR9XHJcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZChuZXdUeXBlKTtcclxuXHRcdHR5cGUgPSBuZXdUeXBlO1xyXG5cdH07XHJcblxyXG59XHJcblxyXG5mdW5jdGlvbiBUcmVlVmlldygpIHt9XHJcblxyXG4vLyBDcmVhdGVzIGEgVHJlZVZpZXdJdGVtIGluc3RhbmNlLCB3aXRoIHN0eWxpbmcgYW5kIG1ldGFkYXRhIHJlbGV2YW50IGZvclxyXG4vLyBBbmd1bGFySlMgYXBwc1xyXG5UcmVlVmlldy5hcHBJdGVtID0gZnVuY3Rpb24obGFiZWwsIG5vZGUpIHtcclxuXHRpZiAobm9kZSA9PT0gZG9jdW1lbnQpIG5vZGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdodG1sJyk7XHJcblx0dmFyIGl0ZW0gPSBuZXcgVHJlZVZpZXdJdGVtKGxhYmVsKTtcclxuXHRpdGVtLm5vZGUgPSBub2RlO1xyXG5cdGl0ZW0uZWxlbWVudC5jbGFzc05hbWUgPSAnbmdpLWFwcCc7XHJcblxyXG5cdC8vIEhpZ2hsaWdodCBET00gZWxlbWVudHMgdGhlIHNjb3BlIGlzIGF0dGFjaGVkIHRvIHdoZW4gaG92ZXJpbmcgdGhlIGl0ZW1cclxuXHQvLyBpbiB0aGUgaW5zcGVjdG9yXHJcblx0aXRlbS5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKGV2ZW50KSB7XHJcblx0XHRpZihldmVudC50YXJnZXQubm9kZU5hbWUgPT09ICdMQUJFTCcgJiYgZXZlbnQudGFyZ2V0LnBhcmVudE5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCduZ2ktc2NvcGUnKSkge1xyXG5cdFx0XHQvLyBEbyBub3QgYWRkIGEgbGF5ZXIgd2hlbiBtb3VzZSBjb21lcyBmcm9tIG5naS1hbm5vdGF0aW9uXHJcblx0XHRcdGlmIChldmVudC5yZWxhdGVkVGFyZ2V0ICYmIGV2ZW50LnJlbGF0ZWRUYXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCduZ2ktYW5ub3RhdGlvbicpKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdFx0XHR2YXIgaXRlbSA9IGV2ZW50LnRhcmdldC5wYXJlbnROb2RlLml0ZW07XHJcblx0XHRcdGlmICggaXRlbS5ub2RlICYmICF3aW5kb3cubmdJbnNwZWN0b3IucGFuZS5pc1Jlc2l6aW5nKSB7XHJcblx0XHRcdFx0dmFyIHRhcmdldCA9IChpdGVtLm5vZGUgPT09IGRvY3VtZW50KSA/XHJcblx0XHRcdFx0XHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdodG1sJykgOiBpdGVtLm5vZGU7XHJcblx0XHRcdFx0Ly8gdGFyZ2V0LmNsYXNzTGlzdC5hZGQoJ25naS1oaWdobGlnaHQnKTtcclxuXHRcdFx0XHROR0kuSGlnaGxpZ2h0ZXIuaGwodGFyZ2V0KTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0pO1xyXG5cdGl0ZW0uZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIGZ1bmN0aW9uKGV2ZW50KSB7XHJcblx0XHRpZihldmVudC50YXJnZXQubm9kZU5hbWUgPT09ICdMQUJFTCcgJiYgZXZlbnQudGFyZ2V0LnBhcmVudE5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCduZ2ktc2NvcGUnKSkge1xyXG5cdFx0XHQvLyBEbyBub3QgcmVtb3ZlIHRoZSBsYXllciB3aGVuIG1vdXNlIGxlYXZlcyBmb3IgbmdpLWFubm90YXRpb25cclxuXHRcdFx0aWYgKGV2ZW50LnJlbGF0ZWRUYXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCduZ2ktYW5ub3RhdGlvbicpKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdFx0XHR2YXIgaXRlbSA9IGV2ZW50LnRhcmdldC5wYXJlbnROb2RlLml0ZW07XHJcblx0XHRcdGlmIChpdGVtLm5vZGUpIHtcclxuXHRcdFx0XHROR0kuSGlnaGxpZ2h0ZXIuY2xlYXIoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0pO1xyXG5cclxuICAgIHJldHVybiBpdGVtO1xyXG59O1xyXG5cclxuLy8gQ3JlYXRlcyBhIFRyZWVWaWV3SXRlbSBpbnN0YW5jZSwgd2l0aCBzdHlsaW5nIGFuZCBtZXRhZGF0YSByZWxldmFudCBmb3JcclxuLy8gQW5ndWxhckpTIHNjb3Blc1xyXG5UcmVlVmlldy5zY29wZUl0ZW0gPSBmdW5jdGlvbihsYWJlbCwgZGVwdGgsIGlzSXNvbGF0ZSkge1xyXG5cdHZhciBpdGVtID0gbmV3IFRyZWVWaWV3SXRlbShsYWJlbCk7XHJcblx0aXRlbS5lbGVtZW50LmNsYXNzTmFtZSA9ICduZ2ktc2NvcGUnO1xyXG5cdGl0ZW0ubWFrZUNvbGxhcHNpYmxlKHRydWUsIGZhbHNlKTtcclxuXHRpZiAoaXNJc29sYXRlKSB7XHJcblx0XHRpdGVtLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbmdpLWlzb2xhdGUtc2NvcGUnKTtcclxuXHR9XHJcblx0aXRlbS5sYWJlbC5jbGFzc05hbWUgPSAnbmdpLWRlcHRoLScgKyBkZXB0aC5sZW5ndGg7XHJcblxyXG5cdC8vIGNvbnNvbGUubG9nIHRoZSBET00gTm9kZSB0aGlzIHNjb3BlIGlzIGF0dGFjaGVkIHRvXHJcblx0aXRlbS5sYWJlbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uKCkge1xyXG5cdFx0Y29uc29sZS5sb2coaXRlbS5ub2RlKTtcclxuXHR9KTtcclxuXHJcblx0cmV0dXJuIGl0ZW07XHJcbn07XHJcblxyXG4vLyBDcmVhdGVzIGEgVHJlZVZpZXdJdGVtIGluc3RhbmNlLCB3aXRoIHN0eWxpbmcgYW5kIG1ldGFkYXRhIHJlbGV2YW50IGZvclxyXG4vLyBBbmd1bGFySlMgbW9kZWxzXHJcblRyZWVWaWV3Lm1vZGVsSXRlbSA9IGZ1bmN0aW9uKG1vZGVsSW5zdGFuY2UsIGRlcHRoKSB7XHJcblx0dmFyIGl0ZW0gPSBuZXcgVHJlZVZpZXdJdGVtKG1vZGVsSW5zdGFuY2Uua2V5ICsgJzonKTtcclxuXHRpdGVtLmVsZW1lbnQuY2xhc3NOYW1lID0gJ25naS1tb2RlbCc7XHJcblx0aXRlbS5sYWJlbC5jbGFzc05hbWUgPSAnbmdpLWRlcHRoLScgKyBkZXB0aC5sZW5ndGg7XHJcblxyXG5cdGl0ZW0ubGFiZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbigpIHtcclxuXHRcdGNvbnNvbGUuaW5mbyhtb2RlbEluc3RhbmNlLnZhbHVlKTtcclxuXHR9KTtcclxuXHJcblx0cmV0dXJuIGl0ZW07XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFRyZWVWaWV3OyIsInZhciBVdGlscyA9IHt9O1xyXG5cclxudmFyIFNQRUNJQUxfQ0hBUlNfUkVHRVhQID0gLyhbXFw6XFwtXFxfXSsoLikpL2c7XHJcbnZhciBNT1pfSEFDS19SRUdFWFAgPSAvXm1veihbQS1aXSkvO1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHNuYWtlX2Nhc2UgdG8gY2FtZWxDYXNlLlxyXG4gKiBBbHNvIGEgc3BlY2lhbCBjYXNlIGZvciBNb3ogcHJlZml4IHN0YXJ0aW5nIHdpdGggdXBwZXIgY2FzZSBsZXR0ZXIuXHJcbiAqL1xyXG5VdGlscy5jYW1lbENhc2UgPSBmdW5jdGlvbihuYW1lKSB7XHJcblx0cmV0dXJuIG5hbWUuXHJcblx0XHRyZXBsYWNlKFNQRUNJQUxfQ0hBUlNfUkVHRVhQLCBmdW5jdGlvbihfLCBzZXBhcmF0b3IsIGxldHRlciwgb2Zmc2V0KSB7XHJcblx0XHRcdHJldHVybiBvZmZzZXQgPyBsZXR0ZXIudG9VcHBlckNhc2UoKSA6IGxldHRlcjtcclxuXHRcdH0pLlxyXG5cdFx0cmVwbGFjZShNT1pfSEFDS19SRUdFWFAsICdNb3okMScpO1xyXG59XHJcblxyXG52YXIgRk5fQVJHUyA9IC9eZnVuY3Rpb25cXHMqW15cXChdKlxcKFxccyooW15cXCldKilcXCkvbTtcclxudmFyIEZOX0FSR19TUExJVCA9IC8sLztcclxudmFyIEZOX0FSRyA9IC9eXFxzKihfPykoXFxTKz8pXFwxXFxzKiQvO1xyXG52YXIgU1RSSVBfQ09NTUVOVFMgPSAvKChcXC9cXC8uKiQpfChcXC9cXCpbXFxzXFxTXSo/XFwqXFwvKSkvbWc7XHJcblxyXG52YXIgUFJFRklYX1JFR0VYUCA9IC9eKHhbXFw6XFwtX118ZGF0YVtcXDpcXC1fXSkvaTtcclxuLyoqXHJcbiAqIENvbnZlcnRzIGFsbCBhY2NlcHRlZCBkaXJlY3RpdmVzIGZvcm1hdCBpbnRvIHByb3BlciBkaXJlY3RpdmUgbmFtZS5cclxuICogQWxsIG9mIHRoZXNlIHdpbGwgYmVjb21lICdteURpcmVjdGl2ZSc6XHJcbiAqICAgbXk6RGlyZWN0aXZlXHJcbiAqICAgbXktZGlyZWN0aXZlXHJcbiAqICAgeC1teS1kaXJlY3RpdmVcclxuICogICBkYXRhLW15OmRpcmVjdGl2ZVxyXG4gKi9cclxuVXRpbHMuZGlyZWN0aXZlTm9ybWFsaXplID0gZnVuY3Rpb24obmFtZSkge1xyXG5cdHJldHVybiBVdGlscy5jYW1lbENhc2UobmFtZS5yZXBsYWNlKFBSRUZJWF9SRUdFWFAsICcnKSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZWNlaXZlcyBhIHNlcnZpY2UgZmFjdG9yeSBhbmQgcmV0dXJucyBhbiBpbmplY3Rpb24gdG9rZW4uIE9ubHkgdXNlZCBpblxyXG4gKiBvbGRlciB2ZXJzaW9ucyBvZiBBbmd1bGFySlMgdGhhdCBkaWQgbm90IGV4cG9zZSBgLmFubm90YXRlYFxyXG4gKlxyXG4gKiBBZGFwdGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci5qcy9ibG9iLzBiYWExN2EzYjdhZDJiMjQyZGYyYjI3N2I4MWNlYmRmNzViMDQyODcvc3JjL2F1dG8vaW5qZWN0b3IuanNcclxuICoqL1xyXG5VdGlscy5hbm5vdGF0ZSA9IGZ1bmN0aW9uKGZuKSB7XHJcblx0dmFyICRpbmplY3QsIGZuVGV4dCwgYXJnRGVjbDtcclxuXHJcblx0aWYgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJykge1xyXG5cdFx0aWYgKCEoJGluamVjdCA9IGZuLiRpbmplY3QpKSB7XHJcblx0XHRcdCRpbmplY3QgPSBbXTtcclxuXHRcdFx0aWYgKGZuLmxlbmd0aCkge1xyXG5cdFx0XHRcdGZuVGV4dCA9IGZuLnRvU3RyaW5nKCkucmVwbGFjZShTVFJJUF9DT01NRU5UUywgJycpO1xyXG5cdFx0XHRcdGFyZ0RlY2wgPSBmblRleHQubWF0Y2goRk5fQVJHUyk7XHJcblx0XHRcdFx0aWYoYXJnRGVjbCAmJiBhcmdEZWNsWzFdKXtcclxuXHRcdFx0XHRcdHZhciBhcmdEZWNscyA9IGFyZ0RlY2xbMV0uc3BsaXQoRk5fQVJHX1NQTElUKTtcclxuXHRcdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYXJnRGVjbHMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0XHRcdFx0dmFyIGFyZyA9IGFyZ0RlY2xzW2ldO1xyXG5cdFx0XHRcdFx0XHRhcmcucmVwbGFjZShGTl9BUkcsIGZ1bmN0aW9uKGFsbCwgdW5kZXJzY29yZSwgbmFtZSkge1xyXG5cdFx0XHRcdFx0XHRcdCRpbmplY3QucHVzaChuYW1lKTtcclxuXHRcdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHR9O1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHRmbi4kaW5qZWN0ID0gJGluamVjdDtcclxuXHRcdH1cclxuXHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZm4pKSB7XHJcblx0XHQkaW5qZWN0ID0gZm4uc2xpY2UoMCwgZm4ubGVuZ3RoIC0gMSk7XHJcblx0fSBlbHNlIHtcclxuXHRcdHJldHVybiBmYWxzZTtcclxuXHR9XHJcblxyXG5cdHJldHVybiAkaW5qZWN0O1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzO1xyXG4iLCJ2YXIgTkdJID0ge1xyXG5cdEluc3BlY3RvcjogcmVxdWlyZSgnLi9JbnNwZWN0b3InKSxcclxuXHRBcHA6IHJlcXVpcmUoJy4vQXBwJyksXHJcblx0UHVibGlzaEV2ZW50OiByZXF1aXJlKCcuL1B1Ymxpc2hFdmVudCcpXHJcbn07XHJcblxyXG52YXIgX2FuZ3VsYXI7XHJcbnZhciBfYm9vdHN0cmFwO1xyXG5cclxuXHJcbi8vIFdyYXAgQW5ndWxhciBwcm9wZXJ0eSAocHJpb3IgdG8gYmVpbmcgZGVmaW5lZCBieSBhbmd1bGFyIGl0c2VsZilcclxuLy8gc28gd2UgY2FuIGJlIG5vdGlmaWVkIHdoZW4gQW5ndWxhciBpcyBwcmVzZW50IG9uIHRoZSBwYWdlLCB3aXRob3V0XHJcbi8vIGhhdmluZyB0byByZXNvcnQgdG8gcG9sbGluZ1xyXG5PYmplY3QuZGVmaW5lUHJvcGVydHkod2luZG93LCAnYW5ndWxhcicsIHtcclxuXHQvLyBlbnVtZXJhYmxlOiBmYWxzZSB0byBwcmV2ZW50IG90aGVyIGV4dGVuc2lvbnMgKFdBcHBhbHl6ZXIsIGZvciBleGFtcGxlKVxyXG5cdC8vIGZyb20gdGhpbmtpbmcgYW5ndWxhciBpcyBwcmVzZW50IGJ5IGNoZWNraW5nIFwiaWYgKGFuZ3VsYXIgaW4gd2luZG93KVwiXHJcblx0ZW51bWVyYWJsZTogZmFsc2UsXHJcblx0Y29uZmlndXJhYmxlOiB0cnVlLFxyXG5cdGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBfYW5ndWxhcjsgfSxcclxuXHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xyXG5cdFx0X2FuZ3VsYXIgPSB2YWw7XHJcblx0XHR3cmFwQm9vdHN0cmFwKCk7XHJcblx0XHQvLyBOb3cgdGhhdCBBbmd1bGFyIGlzIHByZXNlbnQgb24gdGhlIHBhZ2UsIGFsbG93IHRoZSBwcm9wZXJ0eSB0byBiZVxyXG5cdFx0Ly8gdmlzaWJsZSB0aHJvdWdoIHJlZmxlY3Rpb25cclxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3aW5kb3csICdhbmd1bGFyJywgeyBlbnVtZXJhYmxlOiB0cnVlIH0pO1xyXG5cdFx0TkdJLlB1Ymxpc2hFdmVudCgnbmdpLWFuZ3VsYXItZm91bmQnKTtcclxuXHR9XHJcbn0pO1xyXG5cclxuZnVuY3Rpb24gd3JhcEJvb3RzdHJhcCgpIHtcclxuXHQvLyBIb29rIEFuZ3VsYXIncyBtYW51YWwgYm9vdHN0cmFwcGluZyBtZWNoYW5pc20gdG8gY2F0Y2ggYXBwbGljYXRpb25zXHJcblx0Ly8gdGhhdCBkbyBub3QgdXNlIHRoZSBcIm5nLWFwcFwiIGRpcmVjdGl2ZVxyXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShfYW5ndWxhciwgJ2Jvb3RzdHJhcCcsIHtcclxuXHRcdGdldDogZnVuY3Rpb24oKSB7XHJcblx0XHRcdC8vIFJldHVybiBmYWxzZXkgdmFsIHdoZW4gYW5ndWxhciBoYXNuJ3QgYXNzaWduZWQgaXQncyBvd24gYm9vdHN0cmFwXHJcblx0XHRcdC8vIHByb3AgeWV0LCBvciB3aWxsIGdldCB3YXJuaW5nIGFib3V0IG11bHRpcGxlIGFuZ3VsYXIgdmVyc2lvbnMgbG9hZGVkXHJcblx0XHRcdHJldHVybiBfYm9vdHN0cmFwID8gbW9kaWZpZWRCb290c3RyYXAgOiBudWxsO1xyXG5cdFx0fSxcclxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XHJcblx0XHRcdF9ib290c3RyYXAgPSB2YWw7XHJcblx0XHR9XHJcblx0fSk7XHJcbn1cclxuXHJcbnZhciBtb2RpZmllZEJvb3RzdHJhcCA9IGZ1bmN0aW9uKG5vZGUsIG1vZHVsZXMpIHtcclxuXHQvLyBVc2VkIHRvIG1vbmtleS1wYXRjaCBvdmVyIGFuZ3VsYXIuYm9vdHN0cmFwLCB0byBhbGxvdyB0aGUgZXh0ZW5zaW9uXHJcblx0Ly8gdG8gYmUgbm90aWZpZWQgd2hlbiBhIG1hbnVhbGx5LWJvb3RzdHJhcHBlZCBhcHAgaGFzIGJlZW4gZm91bmQuIE5lY2Vzc2FyeVxyXG5cdC8vIHNpbmNlIHdlIGNhbid0IGZpbmQgdGhlIGFwcGxpY2F0aW9uIGJ5IHRyYXZlcnNpbmcgdGhlIERPTSBsb29raW5nIGZvciBuZy1hcHBcclxuXHRpbml0aWFsaXplSW5zcGVjdG9yKCk7XHJcblxyXG5cdC8vIENvbnRpbnVlIHdpdGggYW5ndWxhcidzIG5hdGl2ZSBib290c3RyYXAgbWV0aG9kXHJcblx0dmFyIHJldCA9IF9ib290c3RyYXAuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxuXHJcblx0Ly8gVW53cmFwIGlmIGpRdWVyeSBvciBqcUxpdGUgZWxlbWVudFxyXG5cdGlmIChub2RlLmpxdWVyeSB8fCBub2RlLmluamVjdG9yKSBub2RlID0gbm9kZVswXTtcclxuXHJcblx0TkdJLkFwcC5ib290c3RyYXAobm9kZSwgbW9kdWxlcyk7XHJcblxyXG5cdHJldHVybiByZXQ7XHJcbn07XHJcblxyXG4vLyBBdHRlbXB0IHRvIGluaXRpYWxpemUgaW5zcGVjdG9yIGF0IHRoZSBzYW1lIHRpbWUgQW5ndWxhcidzIG5nLWFwcCBkaXJlY3RpdmVcclxuLy8ga2lja3Mgb2ZmLiBJZiBhbmd1bGFyIGlzbid0IGZvdW5kIGF0IHRoaXMgcG9pbnQsIGl0IGhhcyB0byBiZSBhIG1hbnVhbGx5XHJcbi8vIGJvb3RzdHJhcHBlZCBhcHBcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGluaXRpYWxpemVJbnNwZWN0b3IpO1xyXG5cclxuZnVuY3Rpb24gaW5pdGlhbGl6ZUluc3BlY3RvcigpIHtcclxuXHRpZiAoX2FuZ3VsYXIgJiYgIXdpbmRvdy5uZ0luc3BlY3Rvcikge1xyXG5cdFx0d2luZG93Lm5nSW5zcGVjdG9yID0gbmV3IE5HSS5JbnNwZWN0b3IoKTtcclxuXHR9XHJcbn1cclxuXHJcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2ZW50KSB7XHJcblx0aWYgKGV2ZW50Lm9yaWdpbiAhPT0gd2luZG93LmxvY2F0aW9uLm9yaWdpbikgcmV0dXJuO1xyXG5cclxuXHR2YXIgZXZlbnREYXRhID0gZXZlbnQuZGF0YTtcclxuXHRpZiAoIWV2ZW50RGF0YSB8fCB0eXBlb2YgZXZlbnREYXRhICE9PSAnc3RyaW5nJykgcmV0dXJuO1xyXG5cdHRyeSB7XHJcblx0XHRldmVudERhdGEgPSBKU09OLnBhcnNlKGV2ZW50RGF0YSk7XHJcblx0fSBjYXRjaChlKSB7XHJcblx0XHQvLyBOb3QgYSBKU09OIG9iamVjdC4gVHlwaWNhbGx5IG1lYW5zIGFub3RoZXIgc2NyaXB0IG9uIHRoZSBwYWdlXHJcblx0XHQvLyBpcyB1c2luZyBwb3N0TWVzc2FnZS4gU2FmZSB0byBpZ25vcmVcclxuXHR9XHJcblxyXG5cdGlmIChldmVudERhdGEuY29tbWFuZCA9PT0gJ25naS10b2dnbGUnKSB7XHJcblx0XHQvLyBGYWlsIGlmIHRoZSBpbnNwZWN0b3IgaGFzIG5vdCBiZWVuIGluaXRpYWxpemVkIHlldCAoYmVmb3JlIHdpbmRvdy5sb2FkKVxyXG5cdFx0aWYgKCF3aW5kb3cubmdJbnNwZWN0b3IpIHtcclxuXHRcdFx0cmV0dXJuIGNvbnNvbGUud2FybignbmctaW5zcGVjdG9yOiBUaGUgcGFnZSBtdXN0IGZpbmlzaCBsb2FkaW5nIGJlZm9yZSB1c2luZyBuZy1pbnNwZWN0b3InKTtcclxuXHRcdH1cclxuXHJcblx0XHR3aW5kb3cubmdJbnNwZWN0b3IudG9nZ2xlKGV2ZW50RGF0YS5zZXR0aW5ncyk7XHJcblx0fVxyXG5cclxufSwgZmFsc2UpOyJdfQ==
