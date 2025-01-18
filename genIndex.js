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
    const result = content.match(/>({"payload":.+?})</);
    if (!result || !result[1]) return 0;
    var json;
    try { json = JSON.parse(result[1]); } catch {}
    for (let it of json?.payload?.preloadedQueries[0]?.result?.data?.repository?.search?.edges || []) {
        this.note_list.push(`- [${it.node.title}](${github}/issues/${it.node.number})`);
    }
    return json?.payload?.preloadedQueries[0]?.result?.data?.repository?.search?.issueCount;
};

Application.prototype.getIssueList = function (page) {
    return this.httpsGet(github + "/issues?page=" + page + "&q=is:issue+is:closed+label:documentation", (err, content) => {
        this.req_threads[page - 1] = { processed: false, content };
        if (!this.req_threads[page - 2]) return;
        if (!this.req_threads[page - 2].processed) return; // Wait for the previous page
        for (var i = page - 1; i < this.req_threads.length; ++i) {
            if (!this.req_threads[i]) break;
            this.parseIssues(this.req_threads[i].content);
            this.req_threads[i].processed = true;
            console.log('Processed page = %d, total_page = %d.', i + 1, this.req_threads.total_page);
        }
        const req_thread = this.req_threads[this.req_threads.total_page - 1];
        if (req_thread && req_thread.processed) return this.event.emit('note_end');
    });
};

Application.prototype.parseFiles = function (content) {
    const result = content.match(/>({"payload":.+?})</);
    if (!result || !result[1]) return;
    var json;
    try { json = JSON.parse(result[1]); } catch {}
    for (const it of json?.payload?.tree?.items || []) {
        this.file_list.push(`- [${it.name}](${github}/raw/master/documents/${encodeURIComponent(it.name)})`);
    }
};

Application.prototype.run = function () {
    return this.httpsGet(github + "/issues?q=is:issue+is:closed+label:documentation", (err, content) => {
        const issueCount = this.parseIssues(content); // Page 1
        this.req_threads[0] = { processed: true, content };
        if (!(issueCount > 0)) return this.event.emit('note_end');
        this.req_threads.total_page = Math.ceil(issueCount / 25);
        console.log('Processed page = 1, total_page = %d.', this.req_threads.total_page);
        for (let page = 2; page <= this.req_threads.total_page; ++page) { // Page 2
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

if (require.main === module) (function () {
    new Application().run();
})();

