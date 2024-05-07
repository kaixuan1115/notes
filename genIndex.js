'use strict';

const https = require('https');
const url = require('url');
const fs = require('fs');
const EventEmitter = require('events');

const github = 'https://github.com/kaixuan1115/notes';

const Application = function () {
	this.event = new EventEmitter();
	this.note_list = [];
	this.file_list = [];
	this.req_threads = [];
	this.event.on('note_end', this.getFileList.bind(this));
	this.event.on('all_end', this.generateFile.bind(this));
};

Application.prototype.httpsGet = function (urlString, callback) {
	const options = url.parse(urlString);
	options.headers = {
		"User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:63.0) Gecko/20120101 Firefox/63.0"
	};
	var content = '';
	const req = https.get(options, res => {
		res.setEncoding('utf8');
		res.on('data', data => content += data);
		res.on('end', () => callback(null, content));
	});
	req.on('error', () => callback(null, content));
	req.setTimeout(30000, () => {
		req.abort();
		return callback(null, content);
	});
};

Application.prototype.parseIssues = function (content) {
	const regexp = /(\/issues\/\d+)">(.+)<\/a>/g;
	var result;
	while (result = regexp.exec(content)) {
		this.note_list.push(`- [${result[2]}](${github}${result[1]})`);
	}
};

Application.prototype.getIssueList = function (page) {
	return this.httpsGet(github + "/issues?page=" + page + "&q=is:issue+is:closed+label:documentation", (err, content) => {
		this.req_threads[page - 1] = { processed: 0, content };
		if (!this.req_threads[page - 2]) return;
		if (!this.req_threads[page - 2].processed) return;
		for (var i = page - 1; i < this.req_threads.length; ++i) {
			if (!this.req_threads[i]) break;
			this.parseIssues(this.req_threads[i].content);
			this.req_threads[i].processed = 1;
			console.log('Processed page = %d, total_page = %d.', i + 1, this.req_threads.total_page);
		}
		const req_thread = this.req_threads[this.req_threads.total_page - 1];
		if (req_thread && req_thread.processed) return this.event.emit('note_end');
	});
};

Application.prototype.parseFiles = function (content) {
	const regexp = /(\/blob\/master\/documents\/.+?)">(.+?)<\/a>/g;
	var result, set_tmp = new Set();
	while (result = regexp.exec(content)) {
		const str = `- [${result[2]}](${github}${result[1]})`;
		if (set_tmp.has(str)) continue;
		set_tmp.add(str);
		this.file_list.push(str);
	}
};

Application.prototype.run = function () {
	return this.httpsGet(github + "/issues?q=is:issue+is:closed+label:documentation", (err, content) => {
		this.parseIssues(content);
		this.req_threads[0] = { processed: 1, content };
		const result = content.match(/(\d[\d|,]*)\s+Closed/);
		if (!result || !result[1]) return this.event.emit('note_end');
		result[1] = result[1].replace(/,/g, '');
		this.req_threads.total_page = Math.ceil(result[1] / 25);
		console.log('Processed page = 1, total_page = %d.', this.req_threads.total_page);
		for (var page = 2; page <= this.req_threads.total_page; ++page) {
			this.getIssueList(page);
		}
	});
};

Application.prototype.getFileList = function () {
	return this.httpsGet(github + "/tree/master/documents", (err, content) => {
		this.parseFiles(content);
		return this.event.emit('all_end');
	});
};

Application.prototype.generateFile = function () {
	var lines = ['## 笔记\n'];
	lines = lines.concat(this.note_list, ['\n## 文档\n']);
	lines = lines.concat(this.file_list, '\n');
	return fs.writeFileSync('README.md', lines.join('\n'));
};

(function () {
	new Application().run();
})();

