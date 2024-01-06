var format = require('util').format;

var testDir = 'test';

module.exports = {
	lessDir: 'src/less',
	safariDir: 'ng-inspector.safariextension',
	firefoxDir: 'ng-inspector.firefox',
	chromeDir: 'ng-inspector.chrome',
	chromev3Dir: 'ng-inspector.chrome-v3',
	iconsDir: 'src/icons',
	jsDir: 'src/js',
	browserifyEntry: 'src/js/bootstrap.js',
	jsOutputName: 'ng-inspector.js',
	testDir: testDir,
	e2eDir: format('%s/e2e', testDir)
};