
var modbus = require("./helper_modbus.js");

var map_value = function(datatype, data) {
	if (datatype == "uint16") {
		return data[0];
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
	else if (datatype == "boolean") {
		return [ value*1 ];
	}
	return [ value*1 ];
};

exports.init = function(node, app_config, main, host_info) {

	var baudrate = 38400;

	var models = {};

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
		console.log("modbus, error:", err.stack || err);

		if (typeof err.message === "string" &&
				err.message.match(/^Timed out/))
			return false;

		// err.message == "Port Not Open"

		if (this.close)
			this.close();

		console.log("modbus, restarting ...");
		_this._reinit_delay(5000);
		return true;
	};

	var map_itemtype = function(type) {
		if (typeof type !== "string")
			return "output boolean";
		if (type.match(/FC1/i))
			return "output boolean";
		if (type.match(/FC2/i))
			return "input boolean";
		if (type.match(/FC3/i))
			return "output register";
		if (type.match(/FC4/i))
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

	var map = node.map(app_config.map, null, true, null,
		function(n,metadata,config) {
		var command = map_itemtype(config.type);
		var cid = config.id;

		var length = config.length;
		if (typeof length !== "number") {
			var tmp = remap_value(config.datatype, 0);
			length = tmp.length;
		}

		var type = "number";
		if (config.datatype == "boolean") {
			type = "boolean";
		}

		if (!config.ignore) {
			m.client_add(command, cid, {
				"address": config.address || 0,
				"length": length || 1,
				"callback": function(data) {
					var value = map_value(config.datatype, data);
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
	m.connect(app_config.connect_type, app_config.connect_path, app_config.connect_options);

	return [map, m];
};
