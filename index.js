
var modbus = require("./helper_modbus.js");

var map_value = function(datatype, data) {
	if (datatype == "uint16") {
		return data[0];
	}
	return data[0];
};

var remap_value = function(datatype, value) {
	if (datatype == "uint16") {
		return [ value ];
	}
	return [ value ];
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

	if (typeof app_config.devices !== "object" ||
			!Array.isArray(app_config.devices)) {
		throw new Exception("Modbus: Devices not defined.");
	}

	if (typeof app_config.models === "object") {
		for (var cn in app_config.models) {
			models[cn] = app_config.models[cn];
		}
	}


	var m = new modbus.modbus();

	var get_model = function(d) {
		if (typeof d.client === "object") {
			return d.client;
		}
		if (typeof d.type === "string" && 
				typeof models[d.type] === "object") {
			return models[d.type];
		}
		throw new Exception("Modbus: Client config not found.");
	}

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

	var create_er_binding = function(item, command, cid, prefix, nodename) {
		var n = node.node(prefix+nodename);

		if (!item.ignore) {
			// TODO: length aus datatype ermitteln.
			m.client_add(type, cid, {
				"address": item.address || 0,
				"length": item.length || 1,
				"callback": function(data) {
					var value = map_value(item.datatype, data);
					n.publish(undefined, value, true);

				}
			});
		}
		if (m.client_can_set(type)) {
			n.rpc("set", function(reply, value) {
				var data = remap_value(item.datatype, value);
				m.client_set(type, cid, address, data, function() {
					reply(null, "okay");
				});
			});
		}

	};

	var id = 1;
	app_config.devices.forEach(function(d) {
		var model = get_model(d);
		var prefix = "";
		if (typeof d.prefix === "string") {
			prefix = d.prefix;
		}
		var cid = id;
		if (typeof d.id === "number") {
			cid = d.id;
		}
		id = cid+1;

		for (var nodenname in model) {
			var item = model[nodename];
			var type = map_itemtype(item.type);

			create_er_binding(item, type, cid, prefix, nodename);
		}
	});

	// open connection to a port
	m.connect(app_config.connect_type, app_config.connect_path, app_config.connect_options);
};