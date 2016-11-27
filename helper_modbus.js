
var ModbusRTU = require("modbus-serial");

var read_data = function(client_items, address_min, data) {
	client_items.forEach(function(c) {
		c.callback(data.splice(c.address-address_min,
				c.address-address_min+c.length));
	});
};

exports.modbus = function() {
	var _this = this;

	this.client = new ModbusRTU();

	this.commands = {
		"output boolean": {
			command_poll: "writeFC1",
			command_set: "writeFC15",
			clients: {}
		},
		"input boolean": {
			command_poll: "writeFC2",
			clients: {}
		},
		"output register": {
			command_poll: "writeFC3",
			command_set: "writeFC16",
			clients: {}
		},
		"input regiter": {
			command_poll: "writeFC4",
			clients: {}
		}
	};
	
	this.poll_commands = [];
	this.set_commands = [];


	this.pc_id = 0;
	this.run_do = function() {
		if (this.set_commands.length != 0) {
			this.set_commands.shift()(this.run.bind(this));
		} else {
			this.poll_commands[this.pc_id](this.run.bind(this));
			this.pc_id = (this.pc_id+1) % this.poll_commands.length;
		}
	};
	this.run = function() {
		setTimeout(function() {
			this.run_do();
		}, 10);
	};

};

exports.modbus.prototype.client_add = function(type, cid, config) {
	if (typeof this.commands[type].clients[cid] !== "object" ||
			!Array.isArray(this.commands[type].clients[cid])) {
		this.commands[type].clients[cid] = [];
	}

	this.commands[type].clients[cid].push(config);
};

exports.modbus.prototype.client_can_set = function(type) {
	var command_set = this.commands[type].command_set;
	if (command_set)
		return true;
	return false;
};

exports.modbus.prototype.client_set = function(type, cid, address, data, ext_callback) {
	var _this = this;
	var command_set = this.commands[type].command_set;
	if (!command_set) return;

	this.set_commands.push(function(next) {
		_this.send_set(command_set, cid, address, data, function() {
			if (typeof ext_callback === "function")
				ext_callback();
			next();
		});
	});
};

exports.modbus.prototype.send_poll = function(command, cid, address, length, client_items, callback) {
	this.client[command].call(this.client,
			cid,
			address,
			length,
		function(err, data) {
			if (err) {
				console.log("Modbus-Error:", err);
			} else {
				read_data(client_items, address, data.data);
			}
			callback();
		}
       );
};
exports.modbus.prototype.send_set = function(command, cid, o, data, callback) {
	this.client[command].call(this.client,
			cid,
			o.address,
			data,
		function(err, data) {
			if (err) {
				console.log("Modbus-Error:", err);
			}
			callback();
		}
	);
};

// open connection to a port
exports.modbus.prototype.connect = function(connect_type, path, options);

	if (typeof this.client["connect" + connect_type] !== "function") {
		throw new Error("Modbus: connect type unknown");
	}
	this.client["connect"+connect_type](path, options, this.run.bind(this));

	for (var type in commands) {
	for (var cid in commands[type]) {
		var address_min = null;
		var address_max = null;
		commands[type].clients[cid].forEach(function(c) {
			if (address_min === null || c.address < address_min) {
				address_min = c.address;
			}
			if (address_max === null || c.address+c.length > address_max) {
				address_max = c.address+c.length;
			}
		});
		// TODO: Besser optimieren.
		//commands[type].clients[cid].address = address_min;
		//commands[type].clients[cid].length = address_max-address_min;

		(function(command, cid, address, length, client_items) {
			_this.poll_commands.push(function(next) {
				send_poll(command, cid, address, length, client_items, next);
			});
		})(commands[type].poll_command, cid, address_min,
				address_max-address_min,
				commands[type].clients[cid]);
	}
	}

};