/**
 * Copyright 2013,2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    var spawn = require('child_process').spawn;
    var exec = require('child_process').exec;
    var isUtf8 = require('is-utf8');    

    function ExecuteNode(n) {
        RED.nodes.createNode(this,n);
        this.cmd = (n.command || "").trim();
        if (n.addpay === undefined) { n.addpay = true; }
        this.addpay = n.addpay;
        this.append = (n.append || "").trim();
        this.useSpawn = n.useSpawn;
        this.activeProcesses = {};

        var node = this;
        this.on("input", function(msg) {
            node.status({fill:"blue",shape:"dot",text:" "});
            
            if (this.useSpawn === true) {
                // make the extra args into an array
                // then prepend with the msg.payload

                var arg = node.cmd;
                if (node.addpay) {
                    arg += " "+msg.payload;
                }
                arg += " "+node.append;
                // slice whole line by spaces (trying to honour quotes);
                arg = arg.match(/(?:[^\s"]+|"[^"]*")+/g);
                var cmd = arg.shift();
                var spawnOptions = {
                    cwd : msg.cwd,
                    env : getEnv(msg.env)
                };
                if (RED.settings.verbose) { node.log(cmd+" ["+arg+"]"); }
                if (cmd.indexOf(" ") == -1) {
                    var ex = spawn(cmd,arg, spawnOptions);
                    node.activeProcesses[ex.pid] = ex;
                    ex.stdout.on('data', function (data) {
                        //console.log('[exec] stdout: ' + data);
                        if (isUtf8(data)) { msg.payload = data.toString(); }
                        else { msg.payload = data; }
                        msg.pid = ex.pid;                        
                        node.send(msg);
                    });
                    ex.stderr.on('data', function (data) {
                        //console.log('[exec] stderr: ' + data);
                        if (isUtf8(data)) { msg.payload = data.toString(); }
                        else { msg.payload = new Buffer(data); }
                        msg.payload = {stderr : msg.payload}
                        msg.pid = ex.pid;                        
                        node.send(msg);
                    });
                    ex.on('close', function (code) {
                        //console.log('[exec] result: ' + code);
                        delete node.activeProcesses[ex.pid];                                                          
                        msg.payload = {exitcode: code};
                        msg.pid = ex.pid;
                        node.status({});
                        node.send(msg);
                    });
                    ex.on('error', function (code) {
                        delete node.activeProcesses[ex.pid];
                        node.error(code,msg);
                    });
                }
                else { node.error(RED._("exec.spawnerr")); }
            }
            else {
                var cl = node.cmd;
                if ((node.addpay === true) && ((msg.payload.toString() || "").trim() !== "")) { cl += " "+msg.payload; }
                if (node.append.trim() !== "") { cl += " "+node.append; }
                if (RED.settings.verbose) { node.log(cl); }
                var child = exec(cl, {encoding: 'binary', maxBuffer:10000000}, function (error, stdout, stderr) {
                    msg.payload = new Buffer(stdout,"binary");
                    try {
                        if (isUtf8(msg.payload)) { msg.payload = msg.payload.toString(); }
                    } catch(e) {
                        node.log(RED._("exec.badstdout"));
                    }
                    var msg2 = {payload:stderr};
                    var msg3 = null;
                    //console.log('[exec] stdout: ' + stdout);
                    //console.log('[exec] stderr: ' + stderr);
                    if (error !== null) {
                        msg3 = {payload:error};
                        //console.log('[exec] error: ' + error);
                    }
                    node.status({});
                    msg.stderr = stderr;
                    msg.error;
                    //node.send([msg,msg2,msg3]);
                    node.send(msg);
                    delete node.activeProcesses[child.pid];
                });
                child.on('error',function(){})
                node.activeProcesses[child.pid] = child;
            }
        });
        this.on('close',function() {
            for (var pid in node.activeProcesses) {
                if (node.activeProcesses.hasOwnProperty(pid)) {
                    node.activeProcesses[pid].kill();
                }
            }
            node.activeProcesses = {};
        });
    }
    RED.nodes.registerType("execute",ExecuteNode);
    
    function getEnv(env) {
        if (env) {
            return env;
        }
        else {
            return process.env;
        }
    }
}
