
var modbus = require("./helper_modbus.js");

var map_value = function(datatype, data, buffer) {
	if (datatype == "uint16") {
		//return buffer.readUInt16BE(0);
		return data[0];
	}
	else if (datatype == "floatBE") {
		return buffer.readFloatBE(0);
	}
	else if (datatype == "floatLE") {
		return buffer.readFloatLE(0);
	}
	else if (datatype == "floatBE-swap") {
		buffer.swap16();
		return buffer.readFloatBE(0);
	}
	else if (datatype == "floatLE-swap") {
		buffer.swap16();
		return buffer.readFloatLE(0);
	}
	else if (datatype == "boolean") {
		return data[0] != 0;
	}
	return data[0];
};

var remap_value = function(datatype, value) {
	if (datatype == "uint16") {
		return [ value*1 ];
	}
	if (datatype == "floatBE") {
		let buffer = Buffer.alloc(4);
		buffer.writeFloatBE(value);
		return buffer;
		//return new Uint16Array(buffer.buffer,buffer.byteOffset,buffer.length/2);
		//return [ buffer.readUInt16BE(0), buffer.readUInt16BE(2) ];
	}
	else if (datatype == "floatLE") {
		let buffer = Buffer.alloc(4);
		buffer.writeFloatLE(value);
		return buffer;
	}
	else if (datatype == "floatBE-swap") {
		let buffer = Buffer.alloc(4);
		buffer.writeFloatBE(value);
		buffer.swap16();
		return buffer;
	}
	else if (datatype == "floatLE-swap") {
		let buffer = Buffer.alloc(4);
		buffer.writeFloatLE(value);
		buffer.swap16();
		return buffer;
	}
	else if (datatype == "boolean") {
		return [ value*1 ];
	}
	return [ value*1 ];
};

exports.init = function(node, app_config, main, host_info) {
	if (typeof app_config !== "object") {
		app_config = {};
	}
	if (typeof app_config.connect_type !== "string") {
		throw new Error("Modbus: connect_type not defined");
	}
	if (typeof app_config.connect_path !== "string") {
		throw new Error("Modbus: connect_path not defined");
	}

	var _this = this;

	var m = new modbus.modbus(app_config);
	m.onerror = function(err) {
		console.error("modbus, error msg", err.message);
		console.error("modbus, error:", err);

		if (typeof err.message === "string" &&
				err.message.match(/^Timed out/))
			return false;

		//if (this.close)
		//	this.close();
		if (typeof err.message === "string" &&
				err.message.match(/No such file or director/)) {
			return _this._application_interface.handle_error(err);
		}

		return _this._application_interface.handle_restart(5000);
	};

	var map_itemtype = function(type) {
		if (typeof type !== "string")
			return "output boolean";
		if (type.match(/^FC(1|5|15)$/i))
			return "output boolean";
		if (type.match(/^FC2$/i))
			return "input boolean";
		if (type.match(/^FC(3|6|16)$/i))
			return "output register";
		if (type.match(/^FC4$/i))
			return "input register";

		if (type.match(/coil/))
			return "output boolean";
		if (type.match(/holding/))
			return "output register";
		if (type.match(/output/) && type.match(/register/))
			return "output register";
		if (type.match(/output/))
			return "output boolean";
		if (type.match(/input/) && type.match(/register/))
			return "input register";
		if (type.match(/input/))
			return "input boolean";
		return "output boolean";
	};

	node.announce({
		"type": "modbus.app"
	});

	var map = node.map(app_config.map, null, true, null,
		function(n,metadata,config) {
		var command = map_itemtype(config.type);
		var cid = config.id;

		var length = config.length;
		if (typeof length !== "number") {
			var tmp = remap_value(config.datatype, 0);
			if (Buffer.isBuffer(tmp)) {
				length = tmp.length / 2;
			} else {
				length = tmp.length;
			}
		}

		var type = "number";
		if (config.datatype == "boolean") {
			type = "boolean";
		}

		if (!config.ignore) {
			m.client_add(command, cid, {
				"address": config.address || 0,
				"length": length || 1,
				"callback": function(data, buffer) {
					var value = map_value(config.datatype, data, buffer);
					// better name: reset
					if (config.erase && value) {
						// uninitialized?
						if (n.value === null) {
							// ignore value:
							value = null;
						}
						var ndata = remap_value(config.datatype, 0);
						m.client_set(command, cid, config.address, ndata);
					}
					n.publish(undefined, value, true);
				}
			});
		}
		var writable = false;
		if (m.client_can_set(command)) {
			writable = true;
			if (typeof config.pre_set === "number") {
				var ndata = remap_value(config.datatype, config.pre_set);
				m.client_set(command, cid, config.address, ndata);
				if (config.ignore) {
					n.publish(undefined, config.pre_set, true);
				}
			}

			n.rpc_set = function(reply, value) {
				var data = remap_value(config.datatype, value);
				m.client_set(command, cid, config.address, data, function(err) {
					if (err) {
						reply(err, "Error");
					} else {
						reply(null, "okay");
					}
				});
			};
			n.rpc_toggle = function(reply, time) {
				return n.rpc_set(reply, !n.value, time);
			};
			n.rpc_publish = function(reply, time, value) {
				return n.rpc_set(reply, value, time);
			};
		}

		var metadata_default = {
			"type": type+".property",
			"property": true,
			"writable": writable,
			"rpc": {
			}
		}
		if (writable) {
			metadata_default.rpc.set = {
				"desc": "Set",
				"args": [true]
			};
		}
		n.announce([metadata_default, metadata]);
	});

	// open connection to a port
	m.connect(app_config.connect_type, app_config.connect_path,
		JSON.parse(JSON.stringify(app_config.connect_options || {})));

	return [node, map, m];
};
