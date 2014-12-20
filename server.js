var config = require('./config'),
	Channel = require('./lib/channel'),
	async = require('async'),
	mediaSources = require('./lib/mediaSources'),
	guid = require('./middleware/guid'),
	logger = require('./middleware/logger'),
	restify = require('restify'),
	app = require('./lib/app');

var server = restify.createServer(),
	channels = {};

// Restify bundles
server.use(restify.bodyParser());
server.use(restify.fullResponse());

function unknownMethodHandler(req, res, cb) {
	if (req.method.toLowerCase() === 'options') {
		var allowHeaders = ['Accept', 'Accept-Version', 'Content-Type', 'Api-Version'];

		if (res.methods.indexOf('OPTIONS') === -1) {
			res.methods.push('OPTIONS');
		}

		res.header('Access-Control-Allow-Credentials', true);
		res.header('Access-Control-Allow-Headers', allowHeaders.join(', '));
		res.header('Access-Control-Allow-Methods', res.methods.join(', '));
		res.header('Access-Control-Allow-Origin', req.headers.origin);

		return res.send(204);
	}
	else {
		return res.send(new restify.MethodNotAllowedError());
	}
}

server.on('MethodNotAllowed', unknownMethodHandler);

server.get('/api/channel/listen/:uid', function (req, res) {
	var uid = req.params.uid;
	logger.debug('Play channel', uid);

	var channel = channels[uid];
	if (channel) {
		res.writeHead(200, {
			'Content-Type': 'audio/mpeg'
		});

		channel.join(res);
	}
	else {
		res.status(404);
		res.end();
	}
});

server.post('/api/channel/create/:name', function (req, res) {
	logger.debug('Create channel', req.params.name);
	var uid = guid();
	channels[uid] = new Channel(req.params.name);

	res.json({uid: uid});
	res.end();
});

server.del('/api/channel/remove/:uid', function (req, res) {
	var uid = req.params.uid,
		channel = channels[uid];
	if (channel) {
		channel.stop();
		channel = null;
		res.json({uid: uid});
	}
	else {
		res.status(400);
		res.json({
			error: 'Channel does not exist.'
		});
	}

	res.end();
});

server.post('/api/channel/start/:uid', function (req, res) {
	var uid = req.params.uid,
		channel = channels[uid];
	if (channel) {
		channel.start();
		res.json({uid: uid});
	}
	else {
		res.status(400);
		res.json({
			error: 'Channel does not exist.'
		});
	}

	res.end();
});

server.post('/api/channel/addtrack/:uid', function (req, res) {
	logger.debug('uid', req.params.uid, req.body);
	var channel = channels[req.params.uid];
	if (channel) {
		var engine = mediaSources.getEngine(req.body.engine);

		engine.getTrack(req.body.id, function (err, track) {
			if (!err) {
				channel.addTrack(track);
				res.write(track.url);
			}
			else {
				logger.error('Error occurred while adding a track', req.body.engine, req.body.id, 'to channel', req.params.uid);
				res.write('Error occurred while adding a track');
			}
		});
	}
	else {
		logger.error('Channel', req.params.uid, 'does not exist.');
		res.status(400);
		res.write('Channel does not exist.');
	}
	res.end();
});

server.get('/api/search/:query', function (req, res, next) {
	app.searchTrack(req.params.query, function (err, results) {
		if (err) {
			res.json(err);
		} else {
			res.json( results);
		}

		res.end();
	});

	return next();
});

server.head('/api/search/:query', function (req, res, next) {

	// Create array of tasks to be ran for each media source
	var tasks = mediaSources.getEngines().map(function (source) {
		return function (callback) {
			source.searchMusic(encodeURIComponent(req.params.query), callback);
		}
	});

	// Run music search in parallel
	async.parallel(tasks,
		function (err, results) {
			if (err) {
				res.json(err);
				res.end();
				return;
			}

			// Merge arrays of results and return those as JSON
			res.json([].concat.apply([], results));
			res.end();
		});

	return next();
});

server.listen(process.env.OPENSHIFT_NODEJS_PORT || config.get('port'),
		process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1',
	function () {
		logger.info('Listening on port %d', server.address().port);
	}
);

