/**
 * sora-js-sdk
 * WebRTC SFU Sora JavaScript SDK
 * @version: 2021.2.0
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Sora = factory());
})(this, (function () { 'use strict';

	// Copyright 2018 The Go Authors. All rights reserved.
	// Use of this source code is governed by a BSD-style
	// license that can be found in the LICENSE file.

	function WasmExec () {
		(() => {
			// Map multiple JavaScript environments to a single common API,
			// preferring web standards over Node.js API.
			//
			// Environments considered:
			// - Browsers
			// - Node.js
			// - Electron
			// - Parcel
		
			if (typeof global !== "undefined") ; else if (typeof window !== "undefined") {
				window.global = window;
			} else if (typeof self !== "undefined") {
				self.global = self;
			} else {
				throw new Error("cannot export Go (neither global, window nor self is defined)");
			}
		
			if (!global.require && typeof require !== "undefined") {
				global.require = require;
			}
		
			if (!global.fs && global.require) {
				const fs = require("fs");
				if (Object.keys(fs) !== 0) {
					global.fs = fs;
				}
			}
		
			const enosys = () => {
				const err = new Error("not implemented");
				err.code = "ENOSYS";
				return err;
			};
		
			if (!global.fs) {
				let outputBuf = "";
				global.fs = {
					constants: { O_WRONLY: -1, O_RDWR: -1, O_CREAT: -1, O_TRUNC: -1, O_APPEND: -1, O_EXCL: -1 }, // unused
					writeSync(fd, buf) {
						outputBuf += decoder.decode(buf);
						const nl = outputBuf.lastIndexOf("\n");
						if (nl != -1) {
							console.log(outputBuf.substr(0, nl));
							outputBuf = outputBuf.substr(nl + 1);
						}
						return buf.length;
					},
					write(fd, buf, offset, length, position, callback) {
						if (offset !== 0 || length !== buf.length || position !== null) {
							callback(enosys());
							return;
						}
						const n = this.writeSync(fd, buf);
						callback(null, n);
					},
					chmod(path, mode, callback) { callback(enosys()); },
					chown(path, uid, gid, callback) { callback(enosys()); },
					close(fd, callback) { callback(enosys()); },
					fchmod(fd, mode, callback) { callback(enosys()); },
					fchown(fd, uid, gid, callback) { callback(enosys()); },
					fstat(fd, callback) { callback(enosys()); },
					fsync(fd, callback) { callback(null); },
					ftruncate(fd, length, callback) { callback(enosys()); },
					lchown(path, uid, gid, callback) { callback(enosys()); },
					link(path, link, callback) { callback(enosys()); },
					lstat(path, callback) { callback(enosys()); },
					mkdir(path, perm, callback) { callback(enosys()); },
					open(path, flags, mode, callback) { callback(enosys()); },
					read(fd, buffer, offset, length, position, callback) { callback(enosys()); },
					readdir(path, callback) { callback(enosys()); },
					readlink(path, callback) { callback(enosys()); },
					rename(from, to, callback) { callback(enosys()); },
					rmdir(path, callback) { callback(enosys()); },
					stat(path, callback) { callback(enosys()); },
					symlink(path, link, callback) { callback(enosys()); },
					truncate(path, length, callback) { callback(enosys()); },
					unlink(path, callback) { callback(enosys()); },
					utimes(path, atime, mtime, callback) { callback(enosys()); },
				};
			}
		
			if (!global.process) {
				global.process = {
					getuid() { return -1; },
					getgid() { return -1; },
					geteuid() { return -1; },
					getegid() { return -1; },
					getgroups() { throw enosys(); },
					pid: -1,
					ppid: -1,
					umask() { throw enosys(); },
					cwd() { throw enosys(); },
					chdir() { throw enosys(); },
				};
			}
		
			if (!global.crypto) {
				const nodeCrypto = require("crypto");
				global.crypto = {
					getRandomValues(b) {
						nodeCrypto.randomFillSync(b);
					},
				};
			}
		
			if (!global.performance) {
				global.performance = {
					now() {
						const [sec, nsec] = process.hrtime();
						return sec * 1000 + nsec / 1000000;
					},
				};
			}
		
			if (!global.TextEncoder) {
				global.TextEncoder = require("util").TextEncoder;
			}
		
			if (!global.TextDecoder) {
				global.TextDecoder = require("util").TextDecoder;
			}
		
			// End of polyfills for common API.
		
			const encoder = new TextEncoder("utf-8");
			const decoder = new TextDecoder("utf-8");
		
			global.Go = class {
				constructor() {
					this.argv = ["js"];
					this.env = {};
					this.exit = (code) => {
						if (code !== 0) {
							console.warn("exit code:", code);
						}
					};
					this._exitPromise = new Promise((resolve) => {
						this._resolveExitPromise = resolve;
					});
					this._pendingEvent = null;
					this._scheduledTimeouts = new Map();
					this._nextCallbackTimeoutID = 1;
		
					const setInt64 = (addr, v) => {
						this.mem.setUint32(addr + 0, v, true);
						this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true);
					};
		
					const getInt64 = (addr) => {
						const low = this.mem.getUint32(addr + 0, true);
						const high = this.mem.getInt32(addr + 4, true);
						return low + high * 4294967296;
					};
		
					const loadValue = (addr) => {
						const f = this.mem.getFloat64(addr, true);
						if (f === 0) {
							return undefined;
						}
						if (!isNaN(f)) {
							return f;
						}
		
						const id = this.mem.getUint32(addr, true);
						return this._values[id];
					};
		
					const storeValue = (addr, v) => {
						const nanHead = 0x7FF80000;
		
						if (typeof v === "number" && v !== 0) {
							if (isNaN(v)) {
								this.mem.setUint32(addr + 4, nanHead, true);
								this.mem.setUint32(addr, 0, true);
								return;
							}
							this.mem.setFloat64(addr, v, true);
							return;
						}
		
						if (v === undefined) {
							this.mem.setFloat64(addr, 0, true);
							return;
						}
		
						let id = this._ids.get(v);
						if (id === undefined) {
							id = this._idPool.pop();
							if (id === undefined) {
								id = this._values.length;
							}
							this._values[id] = v;
							this._goRefCounts[id] = 0;
							this._ids.set(v, id);
						}
						this._goRefCounts[id]++;
						let typeFlag = 0;
						switch (typeof v) {
							case "object":
								if (v !== null) {
									typeFlag = 1;
								}
								break;
							case "string":
								typeFlag = 2;
								break;
							case "symbol":
								typeFlag = 3;
								break;
							case "function":
								typeFlag = 4;
								break;
						}
						this.mem.setUint32(addr + 4, nanHead | typeFlag, true);
						this.mem.setUint32(addr, id, true);
					};
		
					const loadSlice = (addr) => {
						const array = getInt64(addr + 0);
						const len = getInt64(addr + 8);
						return new Uint8Array(this._inst.exports.mem.buffer, array, len);
					};
		
					const loadSliceOfValues = (addr) => {
						const array = getInt64(addr + 0);
						const len = getInt64(addr + 8);
						const a = new Array(len);
						for (let i = 0; i < len; i++) {
							a[i] = loadValue(array + i * 8);
						}
						return a;
					};
		
					const loadString = (addr) => {
						const saddr = getInt64(addr + 0);
						const len = getInt64(addr + 8);
						return decoder.decode(new DataView(this._inst.exports.mem.buffer, saddr, len));
					};
		
					const timeOrigin = Date.now() - performance.now();
					this.importObject = {
						go: {
							// Go's SP does not change as long as no Go code is running. Some operations (e.g. calls, getters and setters)
							// may synchronously trigger a Go event handler. This makes Go code get executed in the middle of the imported
							// function. A goroutine can switch to a new stack if the current stack is too small (see morestack function).
							// This changes the SP, thus we have to update the SP used by the imported function.
		
							// func wasmExit(code int32)
							"runtime.wasmExit": (sp) => {
								const code = this.mem.getInt32(sp + 8, true);
								this.exited = true;
								delete this._inst;
								delete this._values;
								delete this._goRefCounts;
								delete this._ids;
								delete this._idPool;
								this.exit(code);
							},
		
							// func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
							"runtime.wasmWrite": (sp) => {
								const fd = getInt64(sp + 8);
								const p = getInt64(sp + 16);
								const n = this.mem.getInt32(sp + 24, true);
								fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n));
							},
		
							// func resetMemoryDataView()
							"runtime.resetMemoryDataView": (sp) => {
								this.mem = new DataView(this._inst.exports.mem.buffer);
							},
		
							// func nanotime1() int64
							"runtime.nanotime1": (sp) => {
								setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000);
							},
		
							// func walltime1() (sec int64, nsec int32)
							"runtime.walltime1": (sp) => {
								const msec = (new Date).getTime();
								setInt64(sp + 8, msec / 1000);
								this.mem.setInt32(sp + 16, (msec % 1000) * 1000000, true);
							},
		
							// func scheduleTimeoutEvent(delay int64) int32
							"runtime.scheduleTimeoutEvent": (sp) => {
								const id = this._nextCallbackTimeoutID;
								this._nextCallbackTimeoutID++;
								this._scheduledTimeouts.set(id, setTimeout(
									() => {
										this._resume();
										while (this._scheduledTimeouts.has(id)) {
											// for some reason Go failed to register the timeout event, log and try again
											// (temporary workaround for https://github.com/golang/go/issues/28975)
											console.warn("scheduleTimeoutEvent: missed timeout event");
											this._resume();
										}
									},
									getInt64(sp + 8) + 1, // setTimeout has been seen to fire up to 1 millisecond early
								));
								this.mem.setInt32(sp + 16, id, true);
							},
		
							// func clearTimeoutEvent(id int32)
							"runtime.clearTimeoutEvent": (sp) => {
								const id = this.mem.getInt32(sp + 8, true);
								clearTimeout(this._scheduledTimeouts.get(id));
								this._scheduledTimeouts.delete(id);
							},
		
							// func getRandomData(r []byte)
							"runtime.getRandomData": (sp) => {
								crypto.getRandomValues(loadSlice(sp + 8));
							},
		
							// func finalizeRef(v ref)
							"syscall/js.finalizeRef": (sp) => {
								const id = this.mem.getUint32(sp + 8, true);
								this._goRefCounts[id]--;
								if (this._goRefCounts[id] === 0) {
									const v = this._values[id];
									this._values[id] = null;
									this._ids.delete(v);
									this._idPool.push(id);
								}
							},
		
							// func stringVal(value string) ref
							"syscall/js.stringVal": (sp) => {
								storeValue(sp + 24, loadString(sp + 8));
							},
		
							// func valueGet(v ref, p string) ref
							"syscall/js.valueGet": (sp) => {
								const result = Reflect.get(loadValue(sp + 8), loadString(sp + 16));
								sp = this._inst.exports.getsp(); // see comment above
								storeValue(sp + 32, result);
							},
		
							// func valueSet(v ref, p string, x ref)
							"syscall/js.valueSet": (sp) => {
								Reflect.set(loadValue(sp + 8), loadString(sp + 16), loadValue(sp + 32));
							},
		
							// func valueDelete(v ref, p string)
							"syscall/js.valueDelete": (sp) => {
								Reflect.deleteProperty(loadValue(sp + 8), loadString(sp + 16));
							},
		
							// func valueIndex(v ref, i int) ref
							"syscall/js.valueIndex": (sp) => {
								storeValue(sp + 24, Reflect.get(loadValue(sp + 8), getInt64(sp + 16)));
							},
		
							// valueSetIndex(v ref, i int, x ref)
							"syscall/js.valueSetIndex": (sp) => {
								Reflect.set(loadValue(sp + 8), getInt64(sp + 16), loadValue(sp + 24));
							},
		
							// func valueCall(v ref, m string, args []ref) (ref, bool)
							"syscall/js.valueCall": (sp) => {
								try {
									const v = loadValue(sp + 8);
									const m = Reflect.get(v, loadString(sp + 16));
									const args = loadSliceOfValues(sp + 32);
									const result = Reflect.apply(m, v, args);
									sp = this._inst.exports.getsp(); // see comment above
									storeValue(sp + 56, result);
									this.mem.setUint8(sp + 64, 1);
								} catch (err) {
									storeValue(sp + 56, err);
									this.mem.setUint8(sp + 64, 0);
								}
							},
		
							// func valueInvoke(v ref, args []ref) (ref, bool)
							"syscall/js.valueInvoke": (sp) => {
								try {
									const v = loadValue(sp + 8);
									const args = loadSliceOfValues(sp + 16);
									const result = Reflect.apply(v, undefined, args);
									sp = this._inst.exports.getsp(); // see comment above
									storeValue(sp + 40, result);
									this.mem.setUint8(sp + 48, 1);
								} catch (err) {
									storeValue(sp + 40, err);
									this.mem.setUint8(sp + 48, 0);
								}
							},
		
							// func valueNew(v ref, args []ref) (ref, bool)
							"syscall/js.valueNew": (sp) => {
								try {
									const v = loadValue(sp + 8);
									const args = loadSliceOfValues(sp + 16);
									const result = Reflect.construct(v, args);
									sp = this._inst.exports.getsp(); // see comment above
									storeValue(sp + 40, result);
									this.mem.setUint8(sp + 48, 1);
								} catch (err) {
									storeValue(sp + 40, err);
									this.mem.setUint8(sp + 48, 0);
								}
							},
		
							// func valueLength(v ref) int
							"syscall/js.valueLength": (sp) => {
								setInt64(sp + 16, parseInt(loadValue(sp + 8).length));
							},
		
							// valuePrepareString(v ref) (ref, int)
							"syscall/js.valuePrepareString": (sp) => {
								const str = encoder.encode(String(loadValue(sp + 8)));
								storeValue(sp + 16, str);
								setInt64(sp + 24, str.length);
							},
		
							// valueLoadString(v ref, b []byte)
							"syscall/js.valueLoadString": (sp) => {
								const str = loadValue(sp + 8);
								loadSlice(sp + 16).set(str);
							},
		
							// func valueInstanceOf(v ref, t ref) bool
							"syscall/js.valueInstanceOf": (sp) => {
								this.mem.setUint8(sp + 24, (loadValue(sp + 8) instanceof loadValue(sp + 16)) ? 1 : 0);
							},
		
							// func copyBytesToGo(dst []byte, src ref) (int, bool)
							"syscall/js.copyBytesToGo": (sp) => {
								const dst = loadSlice(sp + 8);
								const src = loadValue(sp + 32);
								if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)) {
									this.mem.setUint8(sp + 48, 0);
									return;
								}
								const toCopy = src.subarray(0, dst.length);
								dst.set(toCopy);
								setInt64(sp + 40, toCopy.length);
								this.mem.setUint8(sp + 48, 1);
							},
		
							// func copyBytesToJS(dst ref, src []byte) (int, bool)
							"syscall/js.copyBytesToJS": (sp) => {
								const dst = loadValue(sp + 8);
								const src = loadSlice(sp + 16);
								if (!(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)) {
									this.mem.setUint8(sp + 48, 0);
									return;
								}
								const toCopy = src.subarray(0, dst.length);
								dst.set(toCopy);
								setInt64(sp + 40, toCopy.length);
								this.mem.setUint8(sp + 48, 1);
							},
		
							"debug": (value) => {
								console.log(value);
							},
						}
					};
				}
		
				async run(instance) {
					this._inst = instance;
					this.mem = new DataView(this._inst.exports.mem.buffer);
					this._values = [ // JS values that Go currently has references to, indexed by reference id
						NaN,
						0,
						null,
						true,
						false,
						global,
						this,
					];
					this._goRefCounts = new Array(this._values.length).fill(Infinity); // number of references that Go has to a JS value, indexed by reference id
					this._ids = new Map([ // mapping from JS values to reference ids
						[0, 1],
						[null, 2],
						[true, 3],
						[false, 4],
						[global, 5],
						[this, 6],
					]);
					this._idPool = [];   // unused ids that have been garbage collected
					this.exited = false; // whether the Go program has exited
		
					// Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
					let offset = 4096;
		
					const strPtr = (str) => {
						const ptr = offset;
						const bytes = encoder.encode(str + "\0");
						new Uint8Array(this.mem.buffer, offset, bytes.length).set(bytes);
						offset += bytes.length;
						if (offset % 8 !== 0) {
							offset += 8 - (offset % 8);
						}
						return ptr;
					};
		
					const argc = this.argv.length;
		
					const argvPtrs = [];
					this.argv.forEach((arg) => {
						argvPtrs.push(strPtr(arg));
					});
					argvPtrs.push(0);
		
					const keys = Object.keys(this.env).sort();
					keys.forEach((key) => {
						argvPtrs.push(strPtr(`${key}=${this.env[key]}`));
					});
					argvPtrs.push(0);
		
					const argv = offset;
					argvPtrs.forEach((ptr) => {
						this.mem.setUint32(offset, ptr, true);
						this.mem.setUint32(offset + 4, 0, true);
						offset += 8;
					});
		
					this._inst.exports.run(argc, argv);
					if (this.exited) {
						this._resolveExitPromise();
					}
					await this._exitPromise;
				}
		
				_resume() {
					if (this.exited) {
						throw new Error("Go program has already exited");
					}
					this._inst.exports.resume();
					if (this.exited) {
						this._resolveExitPromise();
					}
				}
		
				_makeFuncWrapper(id) {
					const go = this;
					return function () {
						const event = { id: id, this: this, args: arguments };
						go._pendingEvent = event;
						go._resume();
						return event.result;
					};
				}
			};
		
			if (
				global.require &&
				global.require.main === module &&
				global.process &&
				global.process.versions &&
				!global.process.versions.electron
			) {
				if (process.argv.length < 3) {
					console.error("usage: go_js_wasm_exec [wasm binary] [arguments]");
					process.exit(1);
				}
		
				const go = new Go();
				go.argv = process.argv.slice(2);
				go.env = Object.assign({ TMPDIR: require("os").tmpdir() }, process.env);
				go.exit = process.exit;
				WebAssembly.instantiate(fs.readFileSync(process.argv[2]), go.importObject).then((result) => {
					process.on("exit", (code) => { // Node.js exits if no event handler is pending
						if (code === 0 && !go.exited) {
							// deadlock, make Go print error and stack traces
							go._pendingEvent = { id: 0 };
							go._resume();
						}
					});
					return go.run(result.instance);
				}).catch((err) => {
					console.error(err);
					process.exit(1);
				});
			}
		})();
	}

	/**
	 * @sora/e2ee
	 * WebRTC SFU Sora JavaScript E2EE Library
	 * @version: 2021.1.0
	 * @author: Shiguredo Inc.
	 * @license: Apache-2.0
	 **/

	const WORKER_SCRIPT = "InVzZSBzdHJpY3QiOwovKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnMgKi8KY29uc3QgY29ubmVjdGlvbklkTGVuZ3RoID0gMjY7CmZ1bmN0aW9uIGJ5dGVDb3VudChuKSB7CiAgICBpZiAobiA9PSAwKSB7CiAgICAgICAgcmV0dXJuIDE7CiAgICB9CiAgICAvLyBsb2cyNTYoeCkgPSBsb2coeCkgLyBsb2coMjU2KQogICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5sb2cobikgLyBNYXRoLmxvZygyICoqIDgpICsgMSk7Cn0KZnVuY3Rpb24gYXJyYXlCdWZmZXJUb051bWJlcihhcnJheUJ1ZmZlcikgewogICAgLy8gMzJiaXQg44G+44Gn44KS5oOz5a6aIChCaWdJbnQg44G444Gu5pu444GN5o+b44GI5pmC44Gr6KaB5L+u5q2jKQogICAgY29uc3QgbmV3QXJyYXlCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQpOwogICAgY29uc3QgbmV3RGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcobmV3QXJyYXlCdWZmZXIpOwogICAgY29uc3QgZGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoYXJyYXlCdWZmZXIpOwogICAgY29uc3QgcGFkZGluZ0xlbmd0aCA9IFVpbnQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UIC0gZGF0YVZpZXcuYnl0ZUxlbmd0aDsKICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFkZGluZ0xlbmd0aDsgaSArPSAxKSB7CiAgICAgICAgbmV3RGF0YVZpZXcuc2V0VWludDgoaSwgMCk7CiAgICB9CiAgICBmb3IgKGxldCBpID0gcGFkZGluZ0xlbmd0aCwgaiA9IDA7IGkgPCBVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDsgaSArPSAxLCBqICs9IDEpIHsKICAgICAgICBuZXdEYXRhVmlldy5zZXRVaW50OChpLCBkYXRhVmlldy5nZXRVaW50OChqKSk7CiAgICB9CiAgICByZXR1cm4gbmV3RGF0YVZpZXcuZ2V0VWludDMyKDApOwp9CmZ1bmN0aW9uIGVuY29kZVNGcmFtZUhlYWRlcihzLCBjb3VudCwga2V5SWQpIHsKICAgIC8vICAwIDEgMiAzIDQgNSA2IDcKICAgIC8vICstKy0rLSstKy0rLSstKy0rLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSsKICAgIC8vIHxTfExFTiAgfDF8S0xFTiB8ICAgS0lELi4uIChsZW5ndGg9S0xFTikgICAgfCAgICBDVFIuLi4gKGxlbmd0aD1MRU4pICAgIHwKICAgIC8vICstKy0rLSstKy0rLSstKy0rLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSsKICAgIC8vIFM6IDEgYml0CiAgICAvLyBMRU46IDMgYml0CiAgICAvLyBYOiAxIGJpdAogICAgLy8gS0xFTjogMyBiaXQKICAgIC8vIEtJRDogS0xFTiBieXRlCiAgICAvLyBDVFI6IExFTiBieXRlCiAgICAvLyBUT0RPOiBrZXlJZCAoS0lEKSDjgYwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIDcgYnl0ZSDjgpLotoXjgYjjgabjgYTjgZ/loLTlkIjjga/jgqjjg6njg7zjgYvkvovlpJYKICAgIC8vIFRPRE86IGNvdW50IChDVFIpIOOBjCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgNyBieXRlIOOCkui2heOBiOOBpuOBhOOBn+WgtOWQiOOBr+OCqOODqeODvOOBi+S+i+WklgogICAgaWYgKG1heEtleUlkIDwga2V5SWQgfHwgbWF4Q291bnQgPCBjb3VudCkgewogICAgICAgIHRocm93IG5ldyBFcnJvcigiRVhDRUVERUQtTUFYSU1VTS1CUk9BRENBU1RJTkctVElNRSIpOwogICAgfQogICAgY29uc3Qga2xlbiA9IGJ5dGVDb3VudChrZXlJZCk7CiAgICBjb25zdCBsZW4gPSBieXRlQ291bnQoY291bnQpOwogICAgY29uc3QgaGVhZGVyQnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDEgKyBrbGVuICsgbGVuKTsKICAgIGNvbnN0IGhlYWRlckRhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGhlYWRlckJ1ZmZlcik7CiAgICAvLyBTLCBMRU4sIDEsIEtMRU4g44GnIDEgYnl0ZQogICAgaGVhZGVyRGF0YVZpZXcuc2V0VWludDgoMCwgKHMgPDwgNykgKyAobGVuIDw8IDQpICsgKDEgPDwgMykgKyBrbGVuKTsKICAgIGNvbnN0IGhlYWRlclVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShoZWFkZXJCdWZmZXIpOwogICAgY29uc3Qga2V5SWRCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQpOwogICAgY29uc3Qga2V5SWREYXRhVmlldyA9IG5ldyBEYXRhVmlldyhrZXlJZEJ1ZmZlcik7CiAgICBrZXlJZERhdGFWaWV3LnNldFVpbnQzMigwLCBrZXlJZCk7CiAgICBjb25zdCBrZXlJZFVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShrZXlJZEJ1ZmZlcik7CiAgICBoZWFkZXJVaW50OEFycmF5LnNldChrZXlJZFVpbnQ4QXJyYXkuc3ViYXJyYXkoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQgLSBrbGVuKSwgMSk7CiAgICBjb25zdCBjb3VudEJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCk7CiAgICBjb25zdCBjb3VudERhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGNvdW50QnVmZmVyKTsKICAgIGNvdW50RGF0YVZpZXcuc2V0VWludDMyKDAsIGNvdW50KTsKICAgIGNvbnN0IGNvdW50VWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGNvdW50QnVmZmVyKTsKICAgIGhlYWRlclVpbnQ4QXJyYXkuc2V0KGNvdW50VWludDhBcnJheS5zdWJhcnJheShVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCAtIGxlbiksIGtsZW4gKyAxKTsKICAgIHJldHVybiBoZWFkZXJVaW50OEFycmF5Owp9CmZ1bmN0aW9uIHNwbGl0SGVhZGVyKHNmcmFtZSkgewogICAgY29uc3Qgc2ZyYW1lRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoc2ZyYW1lKTsKICAgIGNvbnN0IGhlYWRlciA9IHNmcmFtZURhdGFWaWV3LmdldFVpbnQ4KDApOwogICAgY29uc3QgbGVuID0gKGhlYWRlciAmIDB4NzApID4+IDQ7CiAgICBjb25zdCBrbGVuID0gaGVhZGVyICYgMHgwNzsKICAgIGNvbnN0IHNmcmFtZUhlYWRlckxlbmd0aCA9IDEgKyBrbGVuICsgbGVuOwogICAgY29uc3Qgc2ZyYW1lSGVhZGVyID0gc2ZyYW1lLnNsaWNlKDAsIHNmcmFtZUhlYWRlckxlbmd0aCk7CiAgICBpZiAoc2ZyYW1lSGVhZGVyLmJ5dGVMZW5ndGggPCBzZnJhbWVIZWFkZXJMZW5ndGgpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlVORVhQRUNURUQtU0ZSQU1FLUxFTkdUSCIpOwogICAgfQogICAgY29uc3QgY29ubmVjdGlvbklkID0gc2ZyYW1lLnNsaWNlKHNmcmFtZUhlYWRlckxlbmd0aCwgc2ZyYW1lSGVhZGVyTGVuZ3RoICsgY29ubmVjdGlvbklkTGVuZ3RoKTsKICAgIGNvbnN0IGVuY3J5cHRlZEZyYW1lID0gc2ZyYW1lLnNsaWNlKHNmcmFtZUhlYWRlckxlbmd0aCArIGNvbm5lY3Rpb25JZExlbmd0aCwgc2ZyYW1lLmJ5dGVMZW5ndGgpOwogICAgcmV0dXJuIFtzZnJhbWVIZWFkZXIsIGNvbm5lY3Rpb25JZCwgZW5jcnlwdGVkRnJhbWVdOwp9CmZ1bmN0aW9uIHBhcnNlU0ZyYW1lSGVhZGVyKHNmcmFtZUhlYWRlcikgewogICAgY29uc3Qgc2ZyYW1lSGVhZGVyRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoc2ZyYW1lSGVhZGVyKTsKICAgIGNvbnN0IGhlYWRlciA9IHNmcmFtZUhlYWRlckRhdGFWaWV3LmdldFVpbnQ4KDApOwogICAgY29uc3QgcyA9IChoZWFkZXIgJiAweDgwKSA+PiA3OwogICAgY29uc3QgbGVuID0gKGhlYWRlciAmIDB4NzApID4+IDQ7CiAgICBjb25zdCB4ID0gKGhlYWRlciAmIDB4MDgpID4+IDM7CiAgICBjb25zdCBrbGVuID0gaGVhZGVyICYgMHgwNzsKICAgIC8vIHggZmxhZwogICAgaWYgKHggIT09IDEpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlVORVhQRUNURUQtWC1GTEFHIik7CiAgICB9CiAgICBjb25zdCBoZWFkZXJMZW5ndGggPSAxICsga2xlbiArIGxlbjsKICAgIGlmIChzZnJhbWVIZWFkZXJEYXRhVmlldy5ieXRlTGVuZ3RoIDwgaGVhZGVyTGVuZ3RoKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCJVTkVYUEVDVEVELVNGUkFNRS1IRUFERVItTEVOR1RIIik7CiAgICB9CiAgICBjb25zdCBrZXlJZEJ1ZmZlciA9IHNmcmFtZUhlYWRlci5zbGljZSgxLCAxICsga2xlbik7CiAgICBjb25zdCBrZXlJZCA9IGFycmF5QnVmZmVyVG9OdW1iZXIoa2V5SWRCdWZmZXIpOwogICAgY29uc3QgY291bnRCdWZmZXIgPSBzZnJhbWVIZWFkZXIuc2xpY2UoMSArIGtsZW4sIGhlYWRlckxlbmd0aCk7CiAgICBjb25zdCBjb3VudCA9IGFycmF5QnVmZmVyVG9OdW1iZXIoY291bnRCdWZmZXIpOwogICAgcmV0dXJuIFtzLCBjb3VudCwga2V5SWRdOwp9Ci8qIGVzbGludC1kaXNhYmxlIEB0eXBlc2NyaXB0LWVzbGludC90cmlwbGUtc2xhc2gtcmVmZXJlbmNlLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnMgKi8KLy8vIDxyZWZlcmVuY2UgcGF0aD0iLi9zZnJhbWUudHMiLz4KLy8gVE9ETzog5omx44GG5pWw5YCk44GM5aSn44GN44GE566H5omA44Gn44GvIE51bWJlciDjgYvjgokgQmlnSW50IOOBq+e9ruOBjeaPm+OBiOOCiwovLyBUT0RPOiBCaWdJbnQg44Gr572u44GN5o+b44GI44KL6Zqb44Gr5aSJ5pu044GZ44KLCmNvbnN0IG1heEtleUlkID0gMiAqKiAzMjsKY29uc3QgbWF4Q291bnQgPSAyICoqIDMyOwpjb25zdCBzZWxmRGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwpjb25zdCBjb3VudE1hcCA9IG5ldyBNYXAoKTsKY29uc3Qgd3JpdGVJVk1hcCA9IG5ldyBNYXAoKTsKY29uc3QgcmVtb3RlRGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwpjb25zdCBsYXRlc3RSZW1vdGVLZXlJZE1hcCA9IG5ldyBNYXAoKTsKY29uc3QgbGl0dGxlRW5kaWFuID0gdHJ1ZTsKY29uc3QgYmlnRW5kaWFuID0gIWxpdHRsZUVuZGlhbjsKY29uc3QgdGV4dEVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTsKY29uc3QgdGV4dERlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTsKLy8gVlA4IOOBruOBvwovLyBUT0RPKG5ha2FpKTogVlA5IC8gQVYxIOOCguWwhuadpeeahOOBq+WvvuW/nOOCguiAg+OBiOOCiwpjb25zdCB1bmVuY3J5cHRlZEJ5dGVzID0gewogICAgLy8gSSDjg5Xjg6zjg7zjg6AKICAgIGtleTogMTAsCiAgICAvLyDpnZ4gSSDjg5Xjg6zjg7zjg6AKICAgIGRlbHRhOiAzLAogICAgLy8g44Kq44O844OH44Kj44KqCiAgICB1bmRlZmluZWQ6IDEsCn07CmZ1bmN0aW9uIGdldENvdW50KGNvbm5lY3Rpb25JZCkgewogICAgcmV0dXJuIGNvdW50TWFwLmdldChjb25uZWN0aW9uSWQpIHx8IDA7Cn0KZnVuY3Rpb24gc2V0Q291bnQoY29ubmVjdGlvbklkLCBjb3VudCkgewogICAgcmV0dXJuIGNvdW50TWFwLnNldChjb25uZWN0aW9uSWQsIGNvdW50KTsKfQpmdW5jdGlvbiBnZXRSZW1vdGVEZXJpdmVLZXkoY29ubmVjdGlvbklkLCBrZXlJZCkgewogICAgaWYgKCFyZW1vdGVEZXJpdmVLZXlNYXAuaGFzKGNvbm5lY3Rpb25JZCkpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlJFTU9URS1ERVJJVkVLRVktTUFQLU5PVC1GT1VORCIpOwogICAgfQogICAgY29uc3QgZGVyaXZlS2V5TWFwID0gcmVtb3RlRGVyaXZlS2V5TWFwLmdldChjb25uZWN0aW9uSWQpOwogICAgaWYgKCFkZXJpdmVLZXlNYXApIHsKICAgICAgICByZXR1cm47CiAgICB9CiAgICByZXR1cm4gZGVyaXZlS2V5TWFwLmdldChrZXlJZCk7Cn0KZnVuY3Rpb24gc2V0UmVtb3RlRGVyaXZlS2V5KGNvbm5lY3Rpb25JZCwga2V5SWQsIGRlcml2ZUtleSkgewogICAgbGV0IGRlcml2ZUtleU1hcCA9IHJlbW90ZURlcml2ZUtleU1hcC5nZXQoY29ubmVjdGlvbklkKTsKICAgIGlmICghZGVyaXZlS2V5TWFwKSB7CiAgICAgICAgZGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwogICAgfQogICAgZGVyaXZlS2V5TWFwLnNldChrZXlJZCwgZGVyaXZlS2V5KTsKICAgIHJlbW90ZURlcml2ZUtleU1hcC5zZXQoY29ubmVjdGlvbklkLCBkZXJpdmVLZXlNYXApOwp9CmZ1bmN0aW9uIHNldExhdGVzdFJlbW90ZUtleUlkKGNvbm5lY3Rpb25JZCwga2V5SWQpIHsKICAgIGNvbnN0IGxhdGVzdFJlbW90ZUtleUlkID0gbGF0ZXN0UmVtb3RlS2V5SWRNYXAuZ2V0KGNvbm5lY3Rpb25JZCk7CiAgICBpZiAobGF0ZXN0UmVtb3RlS2V5SWQpIHsKICAgICAgICBpZiAobGF0ZXN0UmVtb3RlS2V5SWQgPCBrZXlJZCkgewogICAgICAgICAgICBsYXRlc3RSZW1vdGVLZXlJZE1hcC5zZXQoY29ubmVjdGlvbklkLCBrZXlJZCk7CiAgICAgICAgfQogICAgfQogICAgZWxzZSB7CiAgICAgICAgbGF0ZXN0UmVtb3RlS2V5SWRNYXAuc2V0KGNvbm5lY3Rpb25JZCwga2V5SWQpOwogICAgfQp9CmZ1bmN0aW9uIHJlbW92ZU9sZFJlbW90ZURlcml2ZUtleXMoKSB7CiAgICBsYXRlc3RSZW1vdGVLZXlJZE1hcC5mb3JFYWNoKChsYXRlc3RLZXlJZCwgY29ubmVjdGlvbklkKSA9PiB7CiAgICAgICAgY29uc3QgZGVyaXZlS2V5TWFwID0gcmVtb3RlRGVyaXZlS2V5TWFwLmdldChjb25uZWN0aW9uSWQpOwogICAgICAgIGlmIChkZXJpdmVLZXlNYXApIHsKICAgICAgICAgICAgZGVyaXZlS2V5TWFwLmZvckVhY2goKF8sIGtleUlkKSA9PiB7CiAgICAgICAgICAgICAgICBpZiAobGF0ZXN0S2V5SWQgIT09IGtleUlkKSB7CiAgICAgICAgICAgICAgICAgICAgZGVyaXZlS2V5TWFwLmRlbGV0ZShrZXlJZCk7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0pOwogICAgICAgIH0KICAgIH0pOwp9CmZ1bmN0aW9uIHJlbW92ZURlcml2ZUtleShjb25uZWN0aW9uSWQpIHsKICAgIGxhdGVzdFJlbW90ZUtleUlkTWFwLmRlbGV0ZShjb25uZWN0aW9uSWQpOwogICAgcmVtb3RlRGVyaXZlS2V5TWFwLmRlbGV0ZShjb25uZWN0aW9uSWQpOwp9CmZ1bmN0aW9uIGdldExhdGVzdFNlbGZEZXJpdmVLZXkoKSB7CiAgICBjb25zdCBkZXJpdmVLZXkgPSBzZWxmRGVyaXZlS2V5TWFwLmdldCgibGF0ZXN0Iik7CiAgICBpZiAoIWRlcml2ZUtleSkgewogICAgICAgIHRocm93IG5ldyBFcnJvcigiTEFURVNULVNFTEYtREVSSVZFS0VZLU5PVF9GT1VORCIpOwogICAgfQogICAgcmV0dXJuIGRlcml2ZUtleTsKfQpmdW5jdGlvbiBzZXRTZWxmRGVyaXZlS2V5KGNvbm5lY3Rpb25JZCwga2V5SWQsIGRlcml2ZUtleSkgewogICAgY29uc3QgY3VycmVudFNlbGZEZXJpdmVLZXkgPSBzZWxmRGVyaXZlS2V5TWFwLmdldCgibGF0ZXN0Iik7CiAgICBpZiAoY3VycmVudFNlbGZEZXJpdmVLZXkpIHsKICAgICAgICBpZiAoY3VycmVudFNlbGZEZXJpdmVLZXlbImtleUlkIl0gPCBrZXlJZCkgewogICAgICAgICAgICBjb25zdCBuZXh0U2VsZkRlcml2ZUtleSA9IHsgY29ubmVjdGlvbklkLCBrZXlJZCwgZGVyaXZlS2V5IH07CiAgICAgICAgICAgIHNlbGZEZXJpdmVLZXlNYXAuc2V0KCJsYXRlc3QiLCBuZXh0U2VsZkRlcml2ZUtleSk7CiAgICAgICAgfQogICAgfQogICAgZWxzZSB7CiAgICAgICAgY29uc3QgbmV4dFNlbGZEZXJpdmVLZXkgPSB7IGNvbm5lY3Rpb25JZCwga2V5SWQsIGRlcml2ZUtleSB9OwogICAgICAgIHNlbGZEZXJpdmVLZXlNYXAuc2V0KCJsYXRlc3QiLCBuZXh0U2VsZkRlcml2ZUtleSk7CiAgICB9Cn0KZnVuY3Rpb24gc2lsZW5jZUZyYW1lKGVuY29kZWRGcmFtZSkgewogICAgLy8gY29ubmVjdGlvbi5jcmVhdGVkLCByZWNlaXZlTWVzc2FnZSDlj5fkv6HliY3jga7loLTlkIgKICAgIGlmIChlbmNvZGVkRnJhbWUudHlwZSA9PT0gdW5kZWZpbmVkKSB7CiAgICAgICAgLy8g6Z+z5aOw44Gv5pqX5Y+35YyW44Gv44GE44KL44Go6IGe44GR44Gf44KC44Gu44GY44KD44Gq44GE44Gu44Gn572u44GN5o+b44GI44KLCiAgICAgICAgY29uc3QgbmV3RGF0YSA9IG5ldyBBcnJheUJ1ZmZlcigzKTsKICAgICAgICBjb25zdCBuZXdVaW50OCA9IG5ldyBVaW50OEFycmF5KG5ld0RhdGEpOwogICAgICAgIC8vIE9wdXMg44K144Kk44Os44Oz44K544OV44Os44O844OgCiAgICAgICAgbmV3VWludDguc2V0KFsweGQ4LCAweGZmLCAweGZlXSk7CiAgICAgICAgZW5jb2RlZEZyYW1lLmRhdGEgPSBuZXdEYXRhOwogICAgfQogICAgZWxzZSB7CiAgICAgICAgLy8g5pig5YOP44GM5q2j5bi444GY44KD44Gq44GE44Gf44KBIFBMSSDjgrnjg4jjg7zjg6DjgYznmbrnlJ/jgZfjgabjgZfjgb7jgYYKICAgICAgICAvLyDjgZ3jga7jgZ/jgoEgMzIweDI0MCDjga7nnJ/jgaPpu5LjgarnlLvpnaLjgavnva7jgY3mj5vjgYjjgosKICAgICAgICBjb25zdCBuZXdEYXRhID0gbmV3IEFycmF5QnVmZmVyKDYwKTsKICAgICAgICBjb25zdCBuZXdVaW50OCA9IG5ldyBVaW50OEFycmF5KG5ld0RhdGEpOwogICAgICAgIC8vIHByZXR0aWVyLWlnbm9yZQogICAgICAgIG5ld1VpbnQ4LnNldChbMHhiMCwgMHgwNSwgMHgwMCwgMHg5ZCwgMHgwMSwgMHgyYSwgMHhhMCwgMHgwMCwgMHg1YSwgMHgwMCwKICAgICAgICAgICAgMHgzOSwgMHgwMywgMHgwMCwgMHgwMCwgMHgxYywgMHgyMiwgMHgxNiwgMHgxNiwgMHgyMiwgMHg2NiwKICAgICAgICAgICAgMHgxMiwgMHgyMCwgMHgwNCwgMHg5MCwgMHg0MCwgMHgwMCwgMHhjNSwgMHgwMSwgMHhlMCwgMHg3YywKICAgICAgICAgICAgMHg0ZCwgMHgyZiwgMHhmYSwgMHhkZCwgMHg0ZCwgMHhhNSwgMHg3ZiwgMHg4OSwgMHhhNSwgMHhmZiwKICAgICAgICAgICAgMHg1YiwgMHhhOSwgMHhiNCwgMHhhZiwgMHhmMSwgMHgzNCwgMHhiZiwgMHhlYiwgMHg3NSwgMHgzNiwKICAgICAgICAgICAgMHg5NSwgMHhmZSwgMHgyNiwgMHg5NiwgMHg2MCwgMHhmZSwgMHhmZiwgMHhiYSwgMHhmZiwgMHg0MCwKICAgICAgICBdKTsKICAgICAgICBlbmNvZGVkRnJhbWUuZGF0YSA9IG5ld0RhdGE7CiAgICB9CiAgICByZXR1cm4gZW5jb2RlZEZyYW1lOwp9CmZ1bmN0aW9uIHNldFdyaXRlSVYoY29ubmVjdGlvbklkLCBrZXlJZCwgd3JpdGVJVikgewogICAgY29uc3Qga2V5ID0gW2Nvbm5lY3Rpb25JZCwga2V5SWQudG9TdHJpbmcoKV0uam9pbigiOiIpOwogICAgd3JpdGVJVk1hcC5zZXQoa2V5LCB3cml0ZUlWKTsKfQpmdW5jdGlvbiBnZXRXcml0ZUlWKGNvbm5lY3Rpb25JZCwga2V5SWQpIHsKICAgIGNvbnN0IGtleSA9IFtjb25uZWN0aW9uSWQsIGtleUlkLnRvU3RyaW5nKCldLmpvaW4oIjoiKTsKICAgIHJldHVybiB3cml0ZUlWTWFwLmdldChrZXkpOwp9CmZ1bmN0aW9uIGdlbmVyYXRlSVYoY291bnQsIGNvbm5lY3Rpb25JZCwga2V5SWQpIHsKICAgIC8vIFRPRE86IGtleUlkIOOBjCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgNyBieXRlIOOCkui2heOBiOOBpuOBhOOBn+WgtOWQiOOBr+OCqOODqeODvOOBi+S+i+WklgogICAgLy8gVE9ETzogY291bnQg44GMIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCA3IGJ5dGUg44KS6LaF44GI44Gm44GE44Gf5aC05ZCI44Gv44Ko44Op44O844GL5L6L5aSWCiAgICAvLyAzMiBiaXQg44G+44GnCiAgICBpZiAobWF4S2V5SWQgPCBrZXlJZCB8fCBtYXhDb3VudCA8IGNvdW50KSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCJFWENFRURFRC1NQVhJTVVNLUJST0FEQ0FTVElORy1USU1FIik7CiAgICB9CiAgICBjb25zdCB3cml0ZUlWID0gZ2V0V3JpdGVJVihjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgIGlmICghd3JpdGVJVikgewogICAgICAgIHRocm93IG5ldyBFcnJvcigiV1JJVEVJVi1OT1QtRk9VTkQiKTsKICAgIH0KICAgIGNvbnN0IHBhZGRpbmdMZW5ndGggPSBObiAtIFVpbnQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UOwogICAgY29uc3QgY291bnRXaXRoUGFkZGluZ0J1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihObik7CiAgICBjb25zdCBjb3VudFdpdGhQYWRkaW5nRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoY291bnRXaXRoUGFkZGluZ0J1ZmZlcik7CiAgICBjb3VudFdpdGhQYWRkaW5nRGF0YVZpZXcuc2V0VWludDMyKHBhZGRpbmdMZW5ndGgsIGNvdW50LCBiaWdFbmRpYW4pOwogICAgY29uc3QgaXYgPSBuZXcgVWludDhBcnJheShObik7CiAgICBjb25zdCBjb3VudFdpdGhQYWRkaW5nID0gbmV3IFVpbnQ4QXJyYXkoY291bnRXaXRoUGFkZGluZ0J1ZmZlcik7CiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE5uOyBpKyspIHsKICAgICAgICBpdltpXSA9IHdyaXRlSVZbaV0gXiBjb3VudFdpdGhQYWRkaW5nW2ldOwogICAgfQogICAgcmV0dXJuIGl2Owp9CmZ1bmN0aW9uIHBhcnNlUGF5bG9hZChwYXlsb2FkVHlwZSwgcGF5bG9hZCkgewogICAgcmV0dXJuIFsKICAgICAgICBuZXcgVWludDhBcnJheShwYXlsb2FkLCAwLCB1bmVuY3J5cHRlZEJ5dGVzW3BheWxvYWRUeXBlXSksCiAgICAgICAgbmV3IFVpbnQ4QXJyYXkocGF5bG9hZCwgdW5lbmNyeXB0ZWRCeXRlc1twYXlsb2FkVHlwZV0pLAogICAgXTsKfQpmdW5jdGlvbiBlbmNvZGVGcmFtZUFkZChoZWFkZXIsIHNmcmFtZUhlYWRlciwgY29ubmVjdGlvbklkKSB7CiAgICBjb25zdCBjb25uZWN0aW9uSWREYXRhID0gdGV4dEVuY29kZXIuZW5jb2RlKGNvbm5lY3Rpb25JZCk7CiAgICBjb25zdCBmcmFtZUFkZCA9IG5ldyBVaW50OEFycmF5KGhlYWRlci5ieXRlTGVuZ3RoICsgc2ZyYW1lSGVhZGVyLmJ5dGVMZW5ndGggKyBjb25uZWN0aW9uSWREYXRhLmJ5dGVMZW5ndGgpOwogICAgZnJhbWVBZGQuc2V0KGhlYWRlciwgMCk7CiAgICBmcmFtZUFkZC5zZXQoc2ZyYW1lSGVhZGVyLCBoZWFkZXIuYnl0ZUxlbmd0aCk7CiAgICBmcmFtZUFkZC5zZXQoY29ubmVjdGlvbklkRGF0YSwgaGVhZGVyLmJ5dGVMZW5ndGggKyBzZnJhbWVIZWFkZXIuYnl0ZUxlbmd0aCk7CiAgICByZXR1cm4gZnJhbWVBZGQ7Cn0KYXN5bmMgZnVuY3Rpb24gZW5jcnlwdEZ1bmN0aW9uKGVuY29kZWRGcmFtZSwgY29udHJvbGxlcikgewogICAgY29uc3QgeyBjb25uZWN0aW9uSWQsIGtleUlkLCBkZXJpdmVLZXkgfSA9IGdldExhdGVzdFNlbGZEZXJpdmVLZXkoKTsKICAgIGlmICghZGVyaXZlS2V5KSB7CiAgICAgICAgcmV0dXJuOwogICAgfQogICAgY29uc3QgY3VycmVudENvdW50ID0gZ2V0Q291bnQoY29ubmVjdGlvbklkKTsKICAgIC8vIGNvdW50IOOBjCAzMiBiaXQg5Lul5LiK44Gu5aC05ZCI44Gv5YGc5q2i44GZ44KLCiAgICBpZiAoY3VycmVudENvdW50ID4gbWF4Q291bnQpIHsKICAgICAgICBwb3N0TWVzc2FnZSh7IHR5cGU6ICJkaXNjb25uZWN0IiB9KTsKICAgIH0KICAgIGNvbnN0IGl2ID0gZ2VuZXJhdGVJVihjdXJyZW50Q291bnQsIGNvbm5lY3Rpb25JZCwga2V5SWQpOwogICAgaWYgKCFpdikgewogICAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IFtoZWFkZXIsIHBheWxvYWRdID0gcGFyc2VQYXlsb2FkKGVuY29kZWRGcmFtZS50eXBlLCBlbmNvZGVkRnJhbWUuZGF0YSk7CiAgICBjb25zdCBzZnJhbWVIZWFkZXIgPSBlbmNvZGVTRnJhbWVIZWFkZXIoMCwgY3VycmVudENvdW50LCBrZXlJZCk7CiAgICBjb25zdCBmcmFtZUFkZCA9IGVuY29kZUZyYW1lQWRkKGhlYWRlciwgc2ZyYW1lSGVhZGVyLCBjb25uZWN0aW9uSWQpOwogICAgY3J5cHRvLnN1YnRsZQogICAgICAgIC5lbmNyeXB0KHsKICAgICAgICBuYW1lOiAiQUVTLUdDTSIsCiAgICAgICAgaXY6IGl2LAogICAgICAgIC8vIOaal+WPt+WMluOBleOCjOOBpuOBhOOBquOBhOmDqOWIhgogICAgICAgIGFkZGl0aW9uYWxEYXRhOiBmcmFtZUFkZCwKICAgIH0sIGRlcml2ZUtleSwgcGF5bG9hZCkKICAgICAgICAudGhlbigoY2lwaGVyVGV4dCkgPT4gewogICAgICAgIGNvbnN0IG5ld0RhdGEgPSBuZXcgQXJyYXlCdWZmZXIoZnJhbWVBZGQuYnl0ZUxlbmd0aCArIGNpcGhlclRleHQuYnl0ZUxlbmd0aCk7CiAgICAgICAgY29uc3QgbmV3RGF0YVVpbnQ4ID0gbmV3IFVpbnQ4QXJyYXkobmV3RGF0YSk7CiAgICAgICAgbmV3RGF0YVVpbnQ4LnNldChmcmFtZUFkZCwgMCk7CiAgICAgICAgbmV3RGF0YVVpbnQ4LnNldChuZXcgVWludDhBcnJheShjaXBoZXJUZXh0KSwgZnJhbWVBZGQuYnl0ZUxlbmd0aCk7CiAgICAgICAgZW5jb2RlZEZyYW1lLmRhdGEgPSBuZXdEYXRhOwogICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShlbmNvZGVkRnJhbWUpOwogICAgfSk7CiAgICBzZXRDb3VudChjb25uZWN0aW9uSWQsIGN1cnJlbnRDb3VudCArIDEpOwp9CmFzeW5jIGZ1bmN0aW9uIGRlY3J5cHRGdW5jdGlvbihlbmNvZGVkRnJhbWUsIGNvbnRyb2xsZXIpIHsKICAgIC8vIOepuuODleODrOODvOODoOWvvuW/nAogICAgaWYgKGVuY29kZWRGcmFtZS5kYXRhLmJ5dGVMZW5ndGggPCAxKSB7CiAgICAgICAgcmV0dXJuOwogICAgfQogICAgdHJ5IHsKICAgICAgICBjb25zdCBmcmFtZU1ldGFkYXRhQnVmZmVyID0gZW5jb2RlZEZyYW1lLmRhdGEuc2xpY2UoMCwgdW5lbmNyeXB0ZWRCeXRlc1tlbmNvZGVkRnJhbWUudHlwZV0pOwogICAgICAgIGNvbnN0IGZyYW1lTWV0YWRhdGEgPSBuZXcgVWludDhBcnJheShmcmFtZU1ldGFkYXRhQnVmZmVyKTsKICAgICAgICBjb25zdCBbc2ZyYW1lSGVhZGVyQnVmZmVyLCBjb25uZWN0aW9uSWRCdWZmZXIsIGVuY3J5cHRlZEZyYW1lQnVmZmVyXSA9IHNwbGl0SGVhZGVyKGVuY29kZWRGcmFtZS5kYXRhLnNsaWNlKHVuZW5jcnlwdGVkQnl0ZXNbZW5jb2RlZEZyYW1lLnR5cGVdKSk7CiAgICAgICAgY29uc3Qgc2ZyYW1lSGVhZGVyID0gbmV3IFVpbnQ4QXJyYXkoc2ZyYW1lSGVhZGVyQnVmZmVyKTsKICAgICAgICBjb25zdCBjb25uZWN0aW9uSWQgPSB0ZXh0RGVjb2Rlci5kZWNvZGUoY29ubmVjdGlvbklkQnVmZmVyKTsKICAgICAgICBjb25zdCBbcywgY291bnQsIGtleUlkXSA9IHBhcnNlU0ZyYW1lSGVhZGVyKHNmcmFtZUhlYWRlckJ1ZmZlcik7CiAgICAgICAgLy8g5LuK5Zue44GvIHMgZmxhZyDjga8gMCDjga7jgb8KICAgICAgICBpZiAocyAhPT0gMCkgewogICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlVORVhQRUNURUQtUy1GTEFHIik7CiAgICAgICAgfQogICAgICAgIGNvbnN0IGRlcml2ZUtleSA9IGdldFJlbW90ZURlcml2ZUtleShjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgICAgICBpZiAoIWRlcml2ZUtleSkgewogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIGNvbnN0IGl2ID0gZ2VuZXJhdGVJVihjb3VudCwgY29ubmVjdGlvbklkLCBrZXlJZCk7CiAgICAgICAgaWYgKCFpdikgewogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIGNvbnN0IGZyYW1lQWRkID0gZW5jb2RlRnJhbWVBZGQoZnJhbWVNZXRhZGF0YSwgc2ZyYW1lSGVhZGVyLCBjb25uZWN0aW9uSWQpOwogICAgICAgIGNyeXB0by5zdWJ0bGUKICAgICAgICAgICAgLmRlY3J5cHQoewogICAgICAgICAgICBuYW1lOiAiQUVTLUdDTSIsCiAgICAgICAgICAgIGl2OiBpdiwKICAgICAgICAgICAgYWRkaXRpb25hbERhdGE6IGZyYW1lQWRkLAogICAgICAgIH0sIGRlcml2ZUtleSwgbmV3IFVpbnQ4QXJyYXkoZW5jcnlwdGVkRnJhbWVCdWZmZXIpKQogICAgICAgICAgICAudGhlbigocGxhaW5UZXh0KSA9PiB7CiAgICAgICAgICAgIGNvbnN0IG5ld0RhdGEgPSBuZXcgQXJyYXlCdWZmZXIoZnJhbWVNZXRhZGF0YUJ1ZmZlci5ieXRlTGVuZ3RoICsgcGxhaW5UZXh0LmJ5dGVMZW5ndGgpOwogICAgICAgICAgICBjb25zdCBuZXdVaW50OCA9IG5ldyBVaW50OEFycmF5KG5ld0RhdGEpOwogICAgICAgICAgICBuZXdVaW50OC5zZXQobmV3IFVpbnQ4QXJyYXkoZnJhbWVNZXRhZGF0YUJ1ZmZlciwgMCwgdW5lbmNyeXB0ZWRCeXRlc1tlbmNvZGVkRnJhbWUudHlwZV0pKTsKICAgICAgICAgICAgbmV3VWludDguc2V0KG5ldyBVaW50OEFycmF5KHBsYWluVGV4dCksIHVuZW5jcnlwdGVkQnl0ZXNbZW5jb2RlZEZyYW1lLnR5cGVdKTsKICAgICAgICAgICAgZW5jb2RlZEZyYW1lLmRhdGEgPSBuZXdEYXRhOwogICAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUoZW5jb2RlZEZyYW1lKTsKICAgICAgICB9KTsKICAgIH0KICAgIGNhdGNoIChlKSB7CiAgICAgICAgLy8g5oOz5a6a5aSW44Gu44OR44Kx44OD44OI44OV44Kp44O844Oe44OD44OI44KS5Y+X5L+h44GX44Gf5aC05ZCICiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKHNpbGVuY2VGcmFtZShlbmNvZGVkRnJhbWUpKTsKICAgIH0KfQovKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvdHJpcGxlLXNsYXNoLXJlZmVyZW5jZSAqLwovLy8gPHJlZmVyZW5jZSBwYXRoPSIuL2UyZWUudHMiLz4KLy8gbm9uY2Ug44K144Kk44K6CmNvbnN0IE5uID0gMTI7Ci8vIGtleSDjgrXjgqTjgroKY29uc3QgTmsgPSAxNjsKLy8ga2V5IOOCteOCpOOCuu+8iGJpdO+8iQpjb25zdCBrZXlMZW5ndGggPSBOayAqIDg7CmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlRGVyaXZlS2V5KG1hdGVyaWFsKSB7CiAgICBjb25zdCBzYWx0ID0gdGV4dEVuY29kZXIuZW5jb2RlKCJTRnJhbWUxMCIpOwogICAgY29uc3QgaW5mbyA9IHRleHRFbmNvZGVyLmVuY29kZSgia2V5Iik7CiAgICBjb25zdCBkZXJpdmVLZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRlcml2ZUtleSh7CiAgICAgICAgbmFtZTogIkhLREYiLAogICAgICAgIHNhbHQ6IHNhbHQsCiAgICAgICAgaGFzaDogIlNIQS0yNTYiLAogICAgICAgIGluZm86IGluZm8sCiAgICB9LCBtYXRlcmlhbCwgewogICAgICAgIG5hbWU6ICJBRVMtR0NNIiwKICAgICAgICBsZW5ndGg6IGtleUxlbmd0aCwKICAgIH0sIGZhbHNlLCBbImVuY3J5cHQiLCAiZGVjcnlwdCJdKTsKICAgIHJldHVybiBkZXJpdmVLZXk7Cn0KYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVXcml0ZUlWKG1hdGVyaWFsKSB7CiAgICBjb25zdCBzYWx0ID0gdGV4dEVuY29kZXIuZW5jb2RlKCJTRnJhbWUxMCIpOwogICAgY29uc3QgaW5mbyA9IHRleHRFbmNvZGVyLmVuY29kZSgic2FsdCIpOwogICAgY29uc3Qgd3JpdGVJVkJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGVyaXZlQml0cyh7CiAgICAgICAgbmFtZTogIkhLREYiLAogICAgICAgIHNhbHQ6IHNhbHQsCiAgICAgICAgaGFzaDogIlNIQS0zODQiLAogICAgICAgIGluZm86IGluZm8sCiAgICB9LCBtYXRlcmlhbCwgCiAgICAvLyBJViDjga8gOTYg44OT44OD44OI44Gq44Gu44GnCiAgICBObiAqIDgpOwogICAgY29uc3Qgd3JpdGVJViA9IG5ldyBVaW50OEFycmF5KHdyaXRlSVZCdWZmZXIpOwogICAgcmV0dXJuIHdyaXRlSVY7Cn0KbGV0IHJlbW92YWxUaW1lb3V0SWQgPSAwOwpvbm1lc3NhZ2UgPSAoZXZlbnQpID0+IHsKICAgIGNvbnN0IHsgdHlwZSB9ID0gZXZlbnQuZGF0YTsKICAgIGlmICh0eXBlID09PSAic2VsZlNlY3JldEtleU1hdGVyaWFsIikgewogICAgICAgIGNvbnN0IHsgc2VsZlNlY3JldEtleU1hdGVyaWFsLCBzZWxmQ29ubmVjdGlvbklkLCBzZWxmS2V5SWQsIHdhaXRpbmdUaW1lIH0gPSBldmVudC5kYXRhOwogICAgICAgIGNvbnN0IHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4gewogICAgICAgICAgICBjcnlwdG8uc3VidGxlCiAgICAgICAgICAgICAgICAuaW1wb3J0S2V5KCJyYXciLCBzZWxmU2VjcmV0S2V5TWF0ZXJpYWwuYnVmZmVyLCAiSEtERiIsIGZhbHNlLCBbImRlcml2ZUJpdHMiLCAiZGVyaXZlS2V5Il0pCiAgICAgICAgICAgICAgICAudGhlbigobWF0ZXJpYWwpID0+IHsKICAgICAgICAgICAgICAgIGdlbmVyYXRlRGVyaXZlS2V5KG1hdGVyaWFsKS50aGVuKChkZXJpdmVLZXkpID0+IHsKICAgICAgICAgICAgICAgICAgICBzZXRTZWxmRGVyaXZlS2V5KHNlbGZDb25uZWN0aW9uSWQsIHNlbGZLZXlJZCwgZGVyaXZlS2V5KTsKICAgICAgICAgICAgICAgIH0pOwogICAgICAgICAgICAgICAgZ2VuZXJhdGVXcml0ZUlWKG1hdGVyaWFsKS50aGVuKCh3cml0ZUlWKSA9PiB7CiAgICAgICAgICAgICAgICAgICAgc2V0V3JpdGVJVihzZWxmQ29ubmVjdGlvbklkLCBzZWxmS2V5SWQsIHdyaXRlSVYpOwogICAgICAgICAgICAgICAgfSk7CiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTsKICAgICAgICAgICAgfSk7CiAgICAgICAgfSwgd2FpdGluZ1RpbWUgfHwgMCk7CiAgICAgICAgLy8gVE9ETzogKzEwMDAg44Gn6Y2155Sf5oiQ5b6M44Gr5a6f6KGM44GV44KM44KL44KI44GG44Gr44GX44Gm44GE44KL44GM55+t44GE5aC05ZCI44Gv5Ly444Gw44GZCiAgICAgICAgY29uc3QgcmVtb3ZhbFdhaXRpbmdUaW1lID0gKHdhaXRpbmdUaW1lIHx8IDApICsgMTAwMDsKICAgICAgICBpZiAocmVtb3ZhbFRpbWVvdXRJZCkgewogICAgICAgICAgICAvLyDli5XkvZzmuIjjgb/jgr/jgqTjg57jg7zmnInjgooKICAgICAgICAgICAgaWYgKHdhaXRpbmdUaW1lKSB7CiAgICAgICAgICAgICAgICAvLyBjb25uZWN0aW9uLmRlc3Ryb3llZAogICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHJlbW92YWxUaW1lb3V0SWQpOwogICAgICAgICAgICAgICAgcmVtb3ZhbFRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4gewogICAgICAgICAgICAgICAgICAgIHJlbW92ZU9sZFJlbW90ZURlcml2ZUtleXMoKTsKICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQocmVtb3ZhbFRpbWVvdXRJZCk7CiAgICAgICAgICAgICAgICAgICAgcmVtb3ZhbFRpbWVvdXRJZCA9IDA7CiAgICAgICAgICAgICAgICB9LCByZW1vdmFsV2FpdGluZ1RpbWUpOwogICAgICAgICAgICB9CiAgICAgICAgfQogICAgICAgIGVsc2UgewogICAgICAgICAgICAvLyDli5XkvZzmuIjjgb/jgr/jgqTjg57jg7zjgarjgZcKICAgICAgICAgICAgLy8gY29ubmVjdGlvbi5jcmVhdGVkIOOBruWgtOWQiOOCguWwkeOBl+Wun+ihjOOCkumBheOCieOBm+OCiwogICAgICAgICAgICByZW1vdmFsVGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7CiAgICAgICAgICAgICAgICByZW1vdmVPbGRSZW1vdGVEZXJpdmVLZXlzKCk7CiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQocmVtb3ZhbFRpbWVvdXRJZCk7CiAgICAgICAgICAgICAgICByZW1vdmFsVGltZW91dElkID0gMDsKICAgICAgICAgICAgfSwgcmVtb3ZhbFdhaXRpbmdUaW1lKTsKICAgICAgICB9CiAgICB9CiAgICBlbHNlIGlmICh0eXBlID09PSAicmVtb3RlU2VjcmV0S2V5TWF0ZXJpYWxzIikgewogICAgICAgIGNvbnN0IHsgcmVtb3RlU2VjcmV0S2V5TWF0ZXJpYWxzIH0gPSBldmVudC5kYXRhOwogICAgICAgIGZvciAoY29uc3QgW2Nvbm5lY3Rpb25JZCwgcmVtb3RlU2VjcmV0S2V5TWF0ZXJpYWxdIG9mIE9iamVjdC5lbnRyaWVzKHJlbW90ZVNlY3JldEtleU1hdGVyaWFscykpIHsKICAgICAgICAgICAgY29uc3QgeyBrZXlJZCwgc2VjcmV0S2V5TWF0ZXJpYWwgfSA9IHJlbW90ZVNlY3JldEtleU1hdGVyaWFsOwogICAgICAgICAgICBjcnlwdG8uc3VidGxlCiAgICAgICAgICAgICAgICAuaW1wb3J0S2V5KCJyYXciLCBzZWNyZXRLZXlNYXRlcmlhbC5idWZmZXIsICJIS0RGIiwgZmFsc2UsIFsiZGVyaXZlQml0cyIsICJkZXJpdmVLZXkiXSkKICAgICAgICAgICAgICAgIC50aGVuKChtYXRlcmlhbCkgPT4gewogICAgICAgICAgICAgICAgZ2VuZXJhdGVEZXJpdmVLZXkobWF0ZXJpYWwpLnRoZW4oKGRlcml2ZUtleSkgPT4gewogICAgICAgICAgICAgICAgICAgIHNldFJlbW90ZURlcml2ZUtleShjb25uZWN0aW9uSWQsIGtleUlkLCBkZXJpdmVLZXkpOwogICAgICAgICAgICAgICAgfSk7CiAgICAgICAgICAgICAgICBnZW5lcmF0ZVdyaXRlSVYobWF0ZXJpYWwpLnRoZW4oKHdyaXRlSVYpID0+IHsKICAgICAgICAgICAgICAgICAgICBzZXRXcml0ZUlWKGNvbm5lY3Rpb25JZCwga2V5SWQsIHdyaXRlSVYpOwogICAgICAgICAgICAgICAgfSk7CiAgICAgICAgICAgICAgICBzZXRMYXRlc3RSZW1vdGVLZXlJZChjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgICAgICAgICAgfSk7CiAgICAgICAgfQogICAgfQogICAgZWxzZSBpZiAodHlwZSA9PT0gInJlbW92ZVJlbW90ZURlcml2ZUtleSIpIHsKICAgICAgICBjb25zdCB7IGNvbm5lY3Rpb25JZCB9ID0gZXZlbnQuZGF0YTsKICAgICAgICByZW1vdmVEZXJpdmVLZXkoY29ubmVjdGlvbklkKTsKICAgIH0KICAgIGVsc2UgaWYgKHR5cGUgPT09ICJlbmNyeXB0IikgewogICAgICAgIGNvbnN0IHsgcmVhZGFibGVTdHJlYW0sIHdyaXRhYmxlU3RyZWFtIH0gPSBldmVudC5kYXRhOwogICAgICAgIGNvbnN0IHRyYW5zZm9ybVN0cmVhbSA9IG5ldyBUcmFuc2Zvcm1TdHJlYW0oewogICAgICAgICAgICB0cmFuc2Zvcm06IGVuY3J5cHRGdW5jdGlvbiwKICAgICAgICB9KTsKICAgICAgICByZWFkYWJsZVN0cmVhbS5waXBlVGhyb3VnaCh0cmFuc2Zvcm1TdHJlYW0pLnBpcGVUbyh3cml0YWJsZVN0cmVhbSk7CiAgICB9CiAgICBlbHNlIGlmICh0eXBlID09PSAiZGVjcnlwdCIpIHsKICAgICAgICBjb25zdCB7IHJlYWRhYmxlU3RyZWFtLCB3cml0YWJsZVN0cmVhbSB9ID0gZXZlbnQuZGF0YTsKICAgICAgICBjb25zdCB0cmFuc2Zvcm1TdHJlYW0gPSBuZXcgVHJhbnNmb3JtU3RyZWFtKHsKICAgICAgICAgICAgdHJhbnNmb3JtOiBkZWNyeXB0RnVuY3Rpb24sCiAgICAgICAgfSk7CiAgICAgICAgcmVhZGFibGVTdHJlYW0ucGlwZVRocm91Z2godHJhbnNmb3JtU3RyZWFtKS5waXBlVG8od3JpdGFibGVTdHJlYW0pOwogICAgfQogICAgZWxzZSBpZiAodHlwZSA9PT0gImNsZWFyIikgewogICAgICAgIGNvdW50TWFwLmNsZWFyKCk7CiAgICAgICAgd3JpdGVJVk1hcC5jbGVhcigpOwogICAgICAgIHJlbW90ZURlcml2ZUtleU1hcC5jbGVhcigpOwogICAgICAgIGxhdGVzdFJlbW90ZUtleUlkTWFwLmNsZWFyKCk7CiAgICAgICAgc2VsZkRlcml2ZUtleU1hcC5jbGVhcigpOwogICAgfQp9Owo=";
	class SoraE2EE {
	    constructor() {
	        // 対応しているかどうかの判断
	        // @ts-ignore トライアル段階の API なので無視する
	        const supportsInsertableStreams = !!RTCRtpSender.prototype.createEncodedStreams;
	        if (!supportsInsertableStreams) {
	            throw new Error("E2EE is not supported in this browser.");
	        }
	        this.worker = null;
	        this.onWorkerDisconnect = null;
	    }
	    // worker を起動する
	    startWorker() {
	        // ワーカーを起動する
	        const workerScript = atob(WORKER_SCRIPT);
	        this.worker = new Worker(URL.createObjectURL(new Blob([workerScript], { type: "application/javascript" })));
	        this.worker.onmessage = (event) => {
	            const { operation } = event.data;
	            if (operation === "disconnect" && typeof this.onWorkerDisconnect === "function") {
	                this.onWorkerDisconnect();
	            }
	        };
	    }
	    // worker の掃除をする
	    clearWorker() {
	        if (this.worker) {
	            this.worker.postMessage({
	                type: "clear",
	            });
	        }
	    }
	    // worker を終了する
	    terminateWorker() {
	        if (this.worker) {
	            this.worker.terminate();
	        }
	    }
	    // 初期化処理
	    async init() {
	        const { preKeyBundle } = await window.e2ee.init();
	        return preKeyBundle;
	    }
	    setupSenderTransform(sender) {
	        if (!sender.track) {
	            return;
	        }
	        // @ts-ignore トライアル段階の API なので無視する
	        const senderStreams = sender.createEncodedStreams();
	        const readableStream = senderStreams.readableStream || senderStreams.readable;
	        const writableStream = senderStreams.writableStream || senderStreams.writable;
	        if (!this.worker) {
	            throw new Error("Worker is null. Call startWorker in advance.");
	        }
	        const message = {
	            type: "encrypt",
	            readableStream: readableStream,
	            writableStream: writableStream,
	        };
	        this.worker.postMessage(message, [readableStream, writableStream]);
	    }
	    setupReceiverTransform(receiver) {
	        // @ts-ignore トライアル段階の API なので無視する
	        const receiverStreams = receiver.createEncodedStreams();
	        const readableStream = receiverStreams.readableStream || receiverStreams.readable;
	        const writableStream = receiverStreams.writableStream || receiverStreams.writable;
	        if (!this.worker) {
	            throw new Error("Worker is null. Call startWorker in advance.");
	        }
	        const message = {
	            type: "decrypt",
	            readableStream: readableStream,
	            writableStream: writableStream,
	        };
	        this.worker.postMessage(message, [readableStream, writableStream]);
	    }
	    postRemoteSecretKeyMaterials(result) {
	        if (!this.worker) {
	            throw new Error("Worker is null. Call startWorker in advance.");
	        }
	        this.worker.postMessage({
	            type: "remoteSecretKeyMaterials",
	            remoteSecretKeyMaterials: result.remoteSecretKeyMaterials,
	        });
	    }
	    postRemoveRemoteDeriveKey(connectionId) {
	        if (!this.worker) {
	            throw new Error("Worker is null. Call startWorker in advance.");
	        }
	        this.worker.postMessage({
	            type: "removeRemoteDeriveKey",
	            connectionId: connectionId,
	        });
	    }
	    postSelfSecretKeyMaterial(selfConnectionId, selfKeyId, selfSecretKeyMaterial, waitingTime = 0) {
	        if (!this.worker) {
	            throw new Error("Worker is null. Call startWorker in advance.");
	        }
	        this.worker.postMessage({
	            type: "selfSecretKeyMaterial",
	            selfConnectionId: selfConnectionId,
	            selfKeyId: selfKeyId,
	            selfSecretKeyMaterial: selfSecretKeyMaterial,
	            waitingTime: waitingTime,
	        });
	    }
	    startSession(connectionId, preKeyBundle) {
	        const [result, err] = window.e2ee.startSession(connectionId, preKeyBundle.identityKey, preKeyBundle.signedPreKey, preKeyBundle.preKeySignature);
	        if (err) {
	            throw err;
	        }
	        return result;
	    }
	    stopSession(connectionId) {
	        const [result, err] = window.e2ee.stopSession(connectionId);
	        if (err) {
	            throw err;
	        }
	        return result;
	    }
	    receiveMessage(message) {
	        const [result, err] = window.e2ee.receiveMessage(message);
	        if (err) {
	            throw err;
	        }
	        return result;
	    }
	    start(selfConnectionId) {
	        const [result, err] = window.e2ee.start(selfConnectionId);
	        if (err) {
	            throw err;
	        }
	        return result;
	    }
	    addPreKeyBundle(connectionId, preKeyBundle) {
	        const err = window.e2ee.addPreKeyBundle(connectionId, preKeyBundle.identityKey, preKeyBundle.signedPreKey, preKeyBundle.preKeySignature);
	        if (err) {
	            throw err;
	        }
	    }
	    selfFingerprint() {
	        return window.e2ee.selfFingerprint();
	    }
	    remoteFingerprints() {
	        return window.e2ee.remoteFingerprints();
	    }
	    static async loadWasm(wasmUrl) {
	        if (!window.e2ee === undefined) {
	            console.warn("E2ee wasm is already loaded. Will not be reload.");
	            return;
	        }
	        WasmExec();
	        if (!window.Go) {
	            throw new Error(`Failed to load module Go. window.Go is ${window.Go}.`);
	        }
	        const go = new Go();
	        const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), go.importObject);
	        go.run(instance);
	        if (!window.e2ee) {
	            throw new Error(`Failed to load module e2ee. window.e2ee is ${window.e2ee}.`);
	        }
	    }
	    static version() {
	        return "2021.1.0";
	    }
	    static wasmVersion() {
	        return window.e2ee.version();
	    }
	}

	// DEFLATE is a complex format; to read this code, you should probably check the RFC first:

	// aliases for shorter compressed code (most minifers don't do this)
	var u8 = Uint8Array, u16 = Uint16Array, u32 = Uint32Array;
	// fixed length extra bits
	var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
	// fixed distance extra bits
	// see fleb note
	var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
	// code length index map
	var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
	// get base, reverse index map from extra bits
	var freb = function (eb, start) {
	    var b = new u16(31);
	    for (var i = 0; i < 31; ++i) {
	        b[i] = start += 1 << eb[i - 1];
	    }
	    // numbers here are at max 18 bits
	    var r = new u32(b[30]);
	    for (var i = 1; i < 30; ++i) {
	        for (var j = b[i]; j < b[i + 1]; ++j) {
	            r[j] = ((j - b[i]) << 5) | i;
	        }
	    }
	    return [b, r];
	};
	var _a = freb(fleb, 2), fl = _a[0], revfl = _a[1];
	// we can ignore the fact that the other numbers are wrong; they never happen anyway
	fl[28] = 258, revfl[258] = 28;
	var _b = freb(fdeb, 0), fd = _b[0], revfd = _b[1];
	// map of value to reverse (assuming 16 bits)
	var rev = new u16(32768);
	for (var i = 0; i < 32768; ++i) {
	    // reverse table algorithm from SO
	    var x = ((i & 0xAAAA) >>> 1) | ((i & 0x5555) << 1);
	    x = ((x & 0xCCCC) >>> 2) | ((x & 0x3333) << 2);
	    x = ((x & 0xF0F0) >>> 4) | ((x & 0x0F0F) << 4);
	    rev[i] = (((x & 0xFF00) >>> 8) | ((x & 0x00FF) << 8)) >>> 1;
	}
	// create huffman tree from u8 "map": index -> code length for code index
	// mb (max bits) must be at most 15
	// TODO: optimize/split up?
	var hMap = (function (cd, mb, r) {
	    var s = cd.length;
	    // index
	    var i = 0;
	    // u16 "map": index -> # of codes with bit length = index
	    var l = new u16(mb);
	    // length of cd must be 288 (total # of codes)
	    for (; i < s; ++i)
	        ++l[cd[i] - 1];
	    // u16 "map": index -> minimum code for bit length = index
	    var le = new u16(mb);
	    for (i = 0; i < mb; ++i) {
	        le[i] = (le[i - 1] + l[i - 1]) << 1;
	    }
	    var co;
	    if (r) {
	        // u16 "map": index -> number of actual bits, symbol for code
	        co = new u16(1 << mb);
	        // bits to remove for reverser
	        var rvb = 15 - mb;
	        for (i = 0; i < s; ++i) {
	            // ignore 0 lengths
	            if (cd[i]) {
	                // num encoding both symbol and bits read
	                var sv = (i << 4) | cd[i];
	                // free bits
	                var r_1 = mb - cd[i];
	                // start value
	                var v = le[cd[i] - 1]++ << r_1;
	                // m is end value
	                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
	                    // every 16 bit value starting with the code yields the same result
	                    co[rev[v] >>> rvb] = sv;
	                }
	            }
	        }
	    }
	    else {
	        co = new u16(s);
	        for (i = 0; i < s; ++i) {
	            if (cd[i]) {
	                co[i] = rev[le[cd[i] - 1]++] >>> (15 - cd[i]);
	            }
	        }
	    }
	    return co;
	});
	// fixed length tree
	var flt = new u8(288);
	for (var i = 0; i < 144; ++i)
	    flt[i] = 8;
	for (var i = 144; i < 256; ++i)
	    flt[i] = 9;
	for (var i = 256; i < 280; ++i)
	    flt[i] = 7;
	for (var i = 280; i < 288; ++i)
	    flt[i] = 8;
	// fixed distance tree
	var fdt = new u8(32);
	for (var i = 0; i < 32; ++i)
	    fdt[i] = 5;
	// fixed length map
	var flm = /*#__PURE__*/ hMap(flt, 9, 0), flrm = /*#__PURE__*/ hMap(flt, 9, 1);
	// fixed distance map
	var fdm = /*#__PURE__*/ hMap(fdt, 5, 0), fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
	// find max of array
	var max = function (a) {
	    var m = a[0];
	    for (var i = 1; i < a.length; ++i) {
	        if (a[i] > m)
	            m = a[i];
	    }
	    return m;
	};
	// read d, starting at bit p and mask with m
	var bits = function (d, p, m) {
	    var o = (p / 8) | 0;
	    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
	};
	// read d, starting at bit p continuing for at least 16 bits
	var bits16 = function (d, p) {
	    var o = (p / 8) | 0;
	    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
	};
	// get end of byte
	var shft = function (p) { return ((p + 7) / 8) | 0; };
	// typed array slice - allows garbage collector to free original reference,
	// while being more compatible than .slice
	var slc = function (v, s, e) {
	    if (s == null || s < 0)
	        s = 0;
	    if (e == null || e > v.length)
	        e = v.length;
	    // can't use .constructor in case user-supplied
	    var n = new (v instanceof u16 ? u16 : v instanceof u32 ? u32 : u8)(e - s);
	    n.set(v.subarray(s, e));
	    return n;
	};
	// error codes
	var ec = [
	    'unexpected EOF',
	    'invalid block type',
	    'invalid length/literal',
	    'invalid distance',
	    'stream finished',
	    'no stream handler',
	    ,
	    'no callback',
	    'invalid UTF-8 data',
	    'extra field too long',
	    'date not in range 1980-2099',
	    'filename too long',
	    'stream finishing',
	    'invalid zip data'
	    // determined by unknown compression method
	];
	var err = function (ind, msg, nt) {
	    var e = new Error(msg || ec[ind]);
	    e.code = ind;
	    if (Error.captureStackTrace)
	        Error.captureStackTrace(e, err);
	    if (!nt)
	        throw e;
	    return e;
	};
	// expands raw DEFLATE data
	var inflt = function (dat, buf, st) {
	    // source length
	    var sl = dat.length;
	    if (!sl || (st && st.f && !st.l))
	        return buf || new u8(0);
	    // have to estimate size
	    var noBuf = !buf || st;
	    // no state
	    var noSt = !st || st.i;
	    if (!st)
	        st = {};
	    // Assumes roughly 33% compression ratio average
	    if (!buf)
	        buf = new u8(sl * 3);
	    // ensure buffer can fit at least l elements
	    var cbuf = function (l) {
	        var bl = buf.length;
	        // need to increase size to fit
	        if (l > bl) {
	            // Double or set to necessary, whichever is greater
	            var nbuf = new u8(Math.max(bl * 2, l));
	            nbuf.set(buf);
	            buf = nbuf;
	        }
	    };
	    //  last chunk         bitpos           bytes
	    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
	    // total bits
	    var tbts = sl * 8;
	    do {
	        if (!lm) {
	            // BFINAL - this is only 1 when last chunk is next
	            final = bits(dat, pos, 1);
	            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
	            var type = bits(dat, pos + 1, 3);
	            pos += 3;
	            if (!type) {
	                // go to end of byte boundary
	                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
	                if (t > sl) {
	                    if (noSt)
	                        err(0);
	                    break;
	                }
	                // ensure size
	                if (noBuf)
	                    cbuf(bt + l);
	                // Copy over uncompressed data
	                buf.set(dat.subarray(s, t), bt);
	                // Get new bitpos, update byte count
	                st.b = bt += l, st.p = pos = t * 8, st.f = final;
	                continue;
	            }
	            else if (type == 1)
	                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
	            else if (type == 2) {
	                //  literal                            lengths
	                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
	                var tl = hLit + bits(dat, pos + 5, 31) + 1;
	                pos += 14;
	                // length+distance tree
	                var ldt = new u8(tl);
	                // code length tree
	                var clt = new u8(19);
	                for (var i = 0; i < hcLen; ++i) {
	                    // use index map to get real code
	                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
	                }
	                pos += hcLen * 3;
	                // code lengths bits
	                var clb = max(clt), clbmsk = (1 << clb) - 1;
	                // code lengths map
	                var clm = hMap(clt, clb, 1);
	                for (var i = 0; i < tl;) {
	                    var r = clm[bits(dat, pos, clbmsk)];
	                    // bits read
	                    pos += r & 15;
	                    // symbol
	                    var s = r >>> 4;
	                    // code length to copy
	                    if (s < 16) {
	                        ldt[i++] = s;
	                    }
	                    else {
	                        //  copy   count
	                        var c = 0, n = 0;
	                        if (s == 16)
	                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
	                        else if (s == 17)
	                            n = 3 + bits(dat, pos, 7), pos += 3;
	                        else if (s == 18)
	                            n = 11 + bits(dat, pos, 127), pos += 7;
	                        while (n--)
	                            ldt[i++] = c;
	                    }
	                }
	                //    length tree                 distance tree
	                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
	                // max length bits
	                lbt = max(lt);
	                // max dist bits
	                dbt = max(dt);
	                lm = hMap(lt, lbt, 1);
	                dm = hMap(dt, dbt, 1);
	            }
	            else
	                err(1);
	            if (pos > tbts) {
	                if (noSt)
	                    err(0);
	                break;
	            }
	        }
	        // Make sure the buffer can hold this + the largest possible addition
	        // Maximum chunk size (practically, theoretically infinite) is 2^17;
	        if (noBuf)
	            cbuf(bt + 131072);
	        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
	        var lpos = pos;
	        for (;; lpos = pos) {
	            // bits read, code
	            var c = lm[bits16(dat, pos) & lms], sym = c >>> 4;
	            pos += c & 15;
	            if (pos > tbts) {
	                if (noSt)
	                    err(0);
	                break;
	            }
	            if (!c)
	                err(2);
	            if (sym < 256)
	                buf[bt++] = sym;
	            else if (sym == 256) {
	                lpos = pos, lm = null;
	                break;
	            }
	            else {
	                var add = sym - 254;
	                // no extra bits needed if less
	                if (sym > 264) {
	                    // index
	                    var i = sym - 257, b = fleb[i];
	                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
	                    pos += b;
	                }
	                // dist
	                var d = dm[bits16(dat, pos) & dms], dsym = d >>> 4;
	                if (!d)
	                    err(3);
	                pos += d & 15;
	                var dt = fd[dsym];
	                if (dsym > 3) {
	                    var b = fdeb[dsym];
	                    dt += bits16(dat, pos) & ((1 << b) - 1), pos += b;
	                }
	                if (pos > tbts) {
	                    if (noSt)
	                        err(0);
	                    break;
	                }
	                if (noBuf)
	                    cbuf(bt + 131072);
	                var end = bt + add;
	                for (; bt < end; bt += 4) {
	                    buf[bt] = buf[bt - dt];
	                    buf[bt + 1] = buf[bt + 1 - dt];
	                    buf[bt + 2] = buf[bt + 2 - dt];
	                    buf[bt + 3] = buf[bt + 3 - dt];
	                }
	                bt = end;
	            }
	        }
	        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
	        if (lm)
	            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
	    } while (!final);
	    return bt == buf.length ? buf : slc(buf, 0, bt);
	};
	// starting at p, write the minimum number of bits that can hold v to d
	var wbits = function (d, p, v) {
	    v <<= p & 7;
	    var o = (p / 8) | 0;
	    d[o] |= v;
	    d[o + 1] |= v >>> 8;
	};
	// starting at p, write the minimum number of bits (>8) that can hold v to d
	var wbits16 = function (d, p, v) {
	    v <<= p & 7;
	    var o = (p / 8) | 0;
	    d[o] |= v;
	    d[o + 1] |= v >>> 8;
	    d[o + 2] |= v >>> 16;
	};
	// creates code lengths from a frequency table
	var hTree = function (d, mb) {
	    // Need extra info to make a tree
	    var t = [];
	    for (var i = 0; i < d.length; ++i) {
	        if (d[i])
	            t.push({ s: i, f: d[i] });
	    }
	    var s = t.length;
	    var t2 = t.slice();
	    if (!s)
	        return [et, 0];
	    if (s == 1) {
	        var v = new u8(t[0].s + 1);
	        v[t[0].s] = 1;
	        return [v, 1];
	    }
	    t.sort(function (a, b) { return a.f - b.f; });
	    // after i2 reaches last ind, will be stopped
	    // freq must be greater than largest possible number of symbols
	    t.push({ s: -1, f: 25001 });
	    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
	    t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
	    // efficient algorithm from UZIP.js
	    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
	    // symbols that combined have high freq, will start processing i2 (high-freq,
	    // non-composite) symbols instead
	    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
	    while (i1 != s - 1) {
	        l = t[t[i0].f < t[i2].f ? i0++ : i2++];
	        r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
	        t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
	    }
	    var maxSym = t2[0].s;
	    for (var i = 1; i < s; ++i) {
	        if (t2[i].s > maxSym)
	            maxSym = t2[i].s;
	    }
	    // code lengths
	    var tr = new u16(maxSym + 1);
	    // max bits in tree
	    var mbt = ln(t[i1 - 1], tr, 0);
	    if (mbt > mb) {
	        // more algorithms from UZIP.js
	        // TODO: find out how this code works (debt)
	        //  ind    debt
	        var i = 0, dt = 0;
	        //    left            cost
	        var lft = mbt - mb, cst = 1 << lft;
	        t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
	        for (; i < s; ++i) {
	            var i2_1 = t2[i].s;
	            if (tr[i2_1] > mb) {
	                dt += cst - (1 << (mbt - tr[i2_1]));
	                tr[i2_1] = mb;
	            }
	            else
	                break;
	        }
	        dt >>>= lft;
	        while (dt > 0) {
	            var i2_2 = t2[i].s;
	            if (tr[i2_2] < mb)
	                dt -= 1 << (mb - tr[i2_2]++ - 1);
	            else
	                ++i;
	        }
	        for (; i >= 0 && dt; --i) {
	            var i2_3 = t2[i].s;
	            if (tr[i2_3] == mb) {
	                --tr[i2_3];
	                ++dt;
	            }
	        }
	        mbt = mb;
	    }
	    return [new u8(tr), mbt];
	};
	// get the max length and assign length codes
	var ln = function (n, l, d) {
	    return n.s == -1
	        ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
	        : (l[n.s] = d);
	};
	// length codes generation
	var lc = function (c) {
	    var s = c.length;
	    // Note that the semicolon was intentional
	    while (s && !c[--s])
	        ;
	    var cl = new u16(++s);
	    //  ind      num         streak
	    var cli = 0, cln = c[0], cls = 1;
	    var w = function (v) { cl[cli++] = v; };
	    for (var i = 1; i <= s; ++i) {
	        if (c[i] == cln && i != s)
	            ++cls;
	        else {
	            if (!cln && cls > 2) {
	                for (; cls > 138; cls -= 138)
	                    w(32754);
	                if (cls > 2) {
	                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
	                    cls = 0;
	                }
	            }
	            else if (cls > 3) {
	                w(cln), --cls;
	                for (; cls > 6; cls -= 6)
	                    w(8304);
	                if (cls > 2)
	                    w(((cls - 3) << 5) | 8208), cls = 0;
	            }
	            while (cls--)
	                w(cln);
	            cls = 1;
	            cln = c[i];
	        }
	    }
	    return [cl.subarray(0, cli), s];
	};
	// calculate the length of output from tree, code lengths
	var clen = function (cf, cl) {
	    var l = 0;
	    for (var i = 0; i < cl.length; ++i)
	        l += cf[i] * cl[i];
	    return l;
	};
	// writes a fixed block
	// returns the new bit pos
	var wfblk = function (out, pos, dat) {
	    // no need to write 00 as type: TypedArray defaults to 0
	    var s = dat.length;
	    var o = shft(pos + 2);
	    out[o] = s & 255;
	    out[o + 1] = s >>> 8;
	    out[o + 2] = out[o] ^ 255;
	    out[o + 3] = out[o + 1] ^ 255;
	    for (var i = 0; i < s; ++i)
	        out[o + i + 4] = dat[i];
	    return (o + 4 + s) * 8;
	};
	// writes a block
	var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
	    wbits(out, p++, final);
	    ++lf[256];
	    var _a = hTree(lf, 15), dlt = _a[0], mlb = _a[1];
	    var _b = hTree(df, 15), ddt = _b[0], mdb = _b[1];
	    var _c = lc(dlt), lclt = _c[0], nlc = _c[1];
	    var _d = lc(ddt), lcdt = _d[0], ndc = _d[1];
	    var lcfreq = new u16(19);
	    for (var i = 0; i < lclt.length; ++i)
	        lcfreq[lclt[i] & 31]++;
	    for (var i = 0; i < lcdt.length; ++i)
	        lcfreq[lcdt[i] & 31]++;
	    var _e = hTree(lcfreq, 7), lct = _e[0], mlcb = _e[1];
	    var nlcc = 19;
	    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
	        ;
	    var flen = (bl + 5) << 3;
	    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
	    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + (2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18]);
	    if (flen <= ftlen && flen <= dtlen)
	        return wfblk(out, p, dat.subarray(bs, bs + bl));
	    var lm, ll, dm, dl;
	    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
	    if (dtlen < ftlen) {
	        lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
	        var llm = hMap(lct, mlcb, 0);
	        wbits(out, p, nlc - 257);
	        wbits(out, p + 5, ndc - 1);
	        wbits(out, p + 10, nlcc - 4);
	        p += 14;
	        for (var i = 0; i < nlcc; ++i)
	            wbits(out, p + 3 * i, lct[clim[i]]);
	        p += 3 * nlcc;
	        var lcts = [lclt, lcdt];
	        for (var it = 0; it < 2; ++it) {
	            var clct = lcts[it];
	            for (var i = 0; i < clct.length; ++i) {
	                var len = clct[i] & 31;
	                wbits(out, p, llm[len]), p += lct[len];
	                if (len > 15)
	                    wbits(out, p, (clct[i] >>> 5) & 127), p += clct[i] >>> 12;
	            }
	        }
	    }
	    else {
	        lm = flm, ll = flt, dm = fdm, dl = fdt;
	    }
	    for (var i = 0; i < li; ++i) {
	        if (syms[i] > 255) {
	            var len = (syms[i] >>> 18) & 31;
	            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
	            if (len > 7)
	                wbits(out, p, (syms[i] >>> 23) & 31), p += fleb[len];
	            var dst = syms[i] & 31;
	            wbits16(out, p, dm[dst]), p += dl[dst];
	            if (dst > 3)
	                wbits16(out, p, (syms[i] >>> 5) & 8191), p += fdeb[dst];
	        }
	        else {
	            wbits16(out, p, lm[syms[i]]), p += ll[syms[i]];
	        }
	    }
	    wbits16(out, p, lm[256]);
	    return p + ll[256];
	};
	// deflate options (nice << 13) | chain
	var deo = /*#__PURE__*/ new u32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
	// empty
	var et = /*#__PURE__*/ new u8(0);
	// compresses data into a raw DEFLATE buffer
	var dflt = function (dat, lvl, plvl, pre, post, lst) {
	    var s = dat.length;
	    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
	    // writing to this writes to the output buffer
	    var w = o.subarray(pre, o.length - post);
	    var pos = 0;
	    if (!lvl || s < 8) {
	        for (var i = 0; i <= s; i += 65535) {
	            // end
	            var e = i + 65535;
	            if (e < s) {
	                // write full block
	                pos = wfblk(w, pos, dat.subarray(i, e));
	            }
	            else {
	                // write final block
	                w[i] = lst;
	                pos = wfblk(w, pos, dat.subarray(i, s));
	            }
	        }
	    }
	    else {
	        var opt = deo[lvl - 1];
	        var n = opt >>> 13, c = opt & 8191;
	        var msk_1 = (1 << plvl) - 1;
	        //    prev 2-byte val map    curr 2-byte val map
	        var prev = new u16(32768), head = new u16(msk_1 + 1);
	        var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
	        var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
	        // 24576 is an arbitrary number of maximum symbols per block
	        // 424 buffer for last block
	        var syms = new u32(25000);
	        // length/literal freq   distance freq
	        var lf = new u16(288), df = new u16(32);
	        //  l/lcnt  exbits  index  l/lind  waitdx  bitpos
	        var lc_1 = 0, eb = 0, i = 0, li = 0, wi = 0, bs = 0;
	        for (; i < s; ++i) {
	            // hash value
	            // deopt when i > s - 3 - at end, deopt acceptable
	            var hv = hsh(i);
	            // index mod 32768    previous index mod
	            var imod = i & 32767, pimod = head[hv];
	            prev[imod] = pimod;
	            head[hv] = imod;
	            // We always should modify head and prev, but only add symbols if
	            // this data is not yet processed ("wait" for wait index)
	            if (wi <= i) {
	                // bytes remaining
	                var rem = s - i;
	                if ((lc_1 > 7000 || li > 24576) && rem > 423) {
	                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
	                    li = lc_1 = eb = 0, bs = i;
	                    for (var j = 0; j < 286; ++j)
	                        lf[j] = 0;
	                    for (var j = 0; j < 30; ++j)
	                        df[j] = 0;
	                }
	                //  len    dist   chain
	                var l = 2, d = 0, ch_1 = c, dif = (imod - pimod) & 32767;
	                if (rem > 2 && hv == hsh(i - dif)) {
	                    var maxn = Math.min(n, rem) - 1;
	                    var maxd = Math.min(32767, i);
	                    // max possible length
	                    // not capped at dif because decompressors implement "rolling" index population
	                    var ml = Math.min(258, rem);
	                    while (dif <= maxd && --ch_1 && imod != pimod) {
	                        if (dat[i + l] == dat[i + l - dif]) {
	                            var nl = 0;
	                            for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
	                                ;
	                            if (nl > l) {
	                                l = nl, d = dif;
	                                // break out early when we reach "nice" (we are satisfied enough)
	                                if (nl > maxn)
	                                    break;
	                                // now, find the rarest 2-byte sequence within this
	                                // length of literals and search for that instead.
	                                // Much faster than just using the start
	                                var mmd = Math.min(dif, nl - 2);
	                                var md = 0;
	                                for (var j = 0; j < mmd; ++j) {
	                                    var ti = (i - dif + j + 32768) & 32767;
	                                    var pti = prev[ti];
	                                    var cd = (ti - pti + 32768) & 32767;
	                                    if (cd > md)
	                                        md = cd, pimod = ti;
	                                }
	                            }
	                        }
	                        // check the previous match
	                        imod = pimod, pimod = prev[imod];
	                        dif += (imod - pimod + 32768) & 32767;
	                    }
	                }
	                // d will be nonzero only when a match was found
	                if (d) {
	                    // store both dist and len data in one Uint32
	                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
	                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
	                    var lin = revfl[l] & 31, din = revfd[d] & 31;
	                    eb += fleb[lin] + fdeb[din];
	                    ++lf[257 + lin];
	                    ++df[din];
	                    wi = i + l;
	                    ++lc_1;
	                }
	                else {
	                    syms[li++] = dat[i];
	                    ++lf[dat[i]];
	                }
	            }
	        }
	        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
	        // this is the easiest way to avoid needing to maintain state
	        if (!lst && pos & 7)
	            pos = wfblk(w, pos + 1, et);
	    }
	    return slc(o, 0, pre + shft(pos) + post);
	};
	// Alder32
	var adler = function () {
	    var a = 1, b = 0;
	    return {
	        p: function (d) {
	            // closures have awful performance
	            var n = a, m = b;
	            var l = d.length | 0;
	            for (var i = 0; i != l;) {
	                var e = Math.min(i + 2655, l);
	                for (; i < e; ++i)
	                    m += n += d[i];
	                n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
	            }
	            a = n, b = m;
	        },
	        d: function () {
	            a %= 65521, b %= 65521;
	            return (a & 255) << 24 | (a >>> 8) << 16 | (b & 255) << 8 | (b >>> 8);
	        }
	    };
	};
	// deflate with opts
	var dopt = function (dat, opt, pre, post, st) {
	    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : (12 + opt.mem), pre, post, !st);
	};
	// write bytes
	var wbytes = function (d, b, v) {
	    for (; v; ++b)
	        d[b] = v, v >>>= 8;
	};
	// zlib header
	var zlh = function (c, o) {
	    var lv = o.level, fl = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
	    c[0] = 120, c[1] = (fl << 6) | (fl ? (32 - 2 * fl) : 1);
	};
	// zlib valid
	var zlv = function (d) {
	    if ((d[0] & 15) != 8 || (d[0] >>> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
	        err(6, 'invalid zlib data');
	    if (d[1] & 32)
	        err(6, 'invalid zlib data: preset dictionaries not supported');
	};
	/**
	 * Compress data with Zlib
	 * @param data The data to compress
	 * @param opts The compression options
	 * @returns The zlib-compressed version of the data
	 */
	function zlibSync(data, opts) {
	    if (!opts)
	        opts = {};
	    var a = adler();
	    a.p(data);
	    var d = dopt(data, opts, 2, 4);
	    return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
	}
	/**
	 * Expands Zlib data
	 * @param data The data to decompress
	 * @param out Where to write the data. Saves memory if you know the decompressed size and provide an output buffer of that length.
	 * @returns The decompressed version of the data
	 */
	function unzlibSync(data, out) {
	    return inflt((zlv(data), data.subarray(2, -4)), out);
	}
	// text decoder
	var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
	// text decoder stream
	var tds = 0;
	try {
	    td.decode(et, { stream: true });
	    tds = 1;
	}
	catch (e) { }

	function browser() {
	    const ua = window.navigator.userAgent.toLocaleLowerCase();
	    if (ua.indexOf("edge") !== -1) {
	        return "edge";
	    }
	    else if (ua.indexOf("chrome") !== -1 && ua.indexOf("edge") === -1) {
	        return "chrome";
	    }
	    else if (ua.indexOf("safari") !== -1 && ua.indexOf("chrome") === -1) {
	        return "safari";
	    }
	    else if (ua.indexOf("opera") !== -1) {
	        return "opera";
	    }
	    else if (ua.indexOf("firefox") !== -1) {
	        return "firefox";
	    }
	    return null;
	}
	function enabledSimulcast() {
	    const REQUIRED_HEADER_EXTEMSIONS = [
	        "urn:ietf:params:rtp-hdrext:sdes:mid",
	        "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
	        "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
	    ];
	    if (!window.RTCRtpSender) {
	        return false;
	    }
	    if (!RTCRtpSender.getCapabilities) {
	        return false;
	    }
	    const capabilities = RTCRtpSender.getCapabilities("video");
	    if (!capabilities) {
	        return false;
	    }
	    const headerExtensions = capabilities.headerExtensions.map((h) => h.uri);
	    const hasAllRequiredHeaderExtensions = REQUIRED_HEADER_EXTEMSIONS.every((h) => headerExtensions.includes(h));
	    return hasAllRequiredHeaderExtensions;
	}
	function parseDataChannelConfiguration(dataChannelConfiguration) {
	    if (typeof dataChannelConfiguration !== "object" || dataChannelConfiguration === null) {
	        throw new Error("Failed to parse options dataChannels. Options dataChannels element must be type 'object'");
	    }
	    const configuration = dataChannelConfiguration;
	    const result = {};
	    if (typeof configuration.label === "string") {
	        result.label = configuration.label;
	    }
	    if (typeof configuration.direction === "string") {
	        result.direction = configuration.direction;
	    }
	    if (typeof configuration.ordered === "boolean") {
	        result.ordered = configuration.ordered;
	    }
	    if (typeof configuration.compress === "boolean") {
	        result.compress = configuration.compress;
	    }
	    if (typeof configuration.maxPacketLifeTime === "number") {
	        result.max_packet_life_time = configuration.maxPacketLifeTime;
	    }
	    if (typeof configuration.maxRetransmits === "number") {
	        result.max_retransmits = configuration.maxRetransmits;
	    }
	    if (typeof configuration.protocol === "string") {
	        result.protocol = configuration.protocol;
	    }
	    return result;
	}
	function parseDataChannelConfigurations(dataChannelConfigurations) {
	    const result = [];
	    for (const dataChannelConfiguration of dataChannelConfigurations) {
	        result.push(parseDataChannelConfiguration(dataChannelConfiguration));
	    }
	    return result;
	}
	function isSafari() {
	    return browser() === "safari";
	}
	function createSignalingMessage(offerSDP, role, channelId, metadata, options, redirect) {
	    if (role !== "sendrecv" && role !== "sendonly" && role !== "recvonly") {
	        throw new Error("Unknown role type");
	    }
	    if (channelId === null || channelId === undefined) {
	        throw new Error("channelId can not be null or undefined");
	    }
	    const message = {
	        type: "connect",
	        sora_client: "Sora JavaScript SDK 2021.2.0",
	        environment: window.navigator.userAgent,
	        role: role,
	        channel_id: channelId,
	        sdp: offerSDP,
	        audio: true,
	        video: true,
	    };
	    if (metadata !== undefined) {
	        message.metadata = metadata;
	    }
	    if (redirect) {
	        message.redirect = true;
	    }
	    if ("signalingNotifyMetadata" in options) {
	        message.signaling_notify_metadata = options.signalingNotifyMetadata;
	    }
	    if ("multistream" in options && options.multistream === true) {
	        // multistream
	        message.multistream = true;
	        // spotlight
	        if ("spotlight" in options) {
	            message.spotlight = options.spotlight;
	            if ("spotlightNumber" in options) {
	                message.spotlight_number = options.spotlightNumber;
	            }
	        }
	        if (message.spotlight === true) {
	            const spotlightFocusRids = ["none", "r0", "r1", "r2"];
	            if (options.spotlightFocusRid !== undefined && 0 <= spotlightFocusRids.indexOf(options.spotlightFocusRid)) {
	                message.spotlight_focus_rid = options.spotlightFocusRid;
	            }
	            if (options.spotlightUnfocusRid !== undefined && 0 <= spotlightFocusRids.indexOf(options.spotlightUnfocusRid)) {
	                message.spotlight_unfocus_rid = options.spotlightUnfocusRid;
	            }
	        }
	    }
	    if ("simulcast" in options || "simulcastRid" in options) {
	        // simulcast
	        if ("simulcast" in options && options.simulcast === true) {
	            message.simulcast = true;
	        }
	        const simalcastRids = ["r0", "r1", "r2"];
	        if (options.simulcastRid !== undefined && 0 <= simalcastRids.indexOf(options.simulcastRid)) {
	            message.simulcast_rid = options.simulcastRid;
	        }
	    }
	    // client_id
	    if ("clientId" in options && options.clientId !== undefined) {
	        message.client_id = options.clientId;
	    }
	    if ("dataChannelSignaling" in options && typeof options.dataChannelSignaling === "boolean") {
	        message.data_channel_signaling = options.dataChannelSignaling;
	    }
	    if ("ignoreDisconnectWebSocket" in options && typeof options.ignoreDisconnectWebSocket === "boolean") {
	        message.ignore_disconnect_websocket = options.ignoreDisconnectWebSocket;
	    }
	    // parse options
	    const audioPropertyKeys = ["audioCodecType", "audioBitRate"];
	    const audioOpusParamsPropertyKeys = [
	        "audioOpusParamsChannels",
	        "audioOpusParamsClockRate",
	        "audioOpusParamsMaxplaybackrate",
	        "audioOpusParamsStereo",
	        "audioOpusParamsSpropStereo",
	        "audioOpusParamsMinptime",
	        "audioOpusParamsPtime",
	        "audioOpusParamsUseinbandfec",
	        "audioOpusParamsUsedtx",
	    ];
	    const videoPropertyKeys = ["videoCodecType", "videoBitRate"];
	    const copyOptions = Object.assign({}, options);
	    Object.keys(copyOptions).forEach((key) => {
	        if (key === "audio" && typeof copyOptions[key] === "boolean") {
	            return;
	        }
	        if (key === "video" && typeof copyOptions[key] === "boolean") {
	            return;
	        }
	        if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
	            return;
	        }
	        if (0 <= audioOpusParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
	            return;
	        }
	        if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
	            return;
	        }
	        delete copyOptions[key];
	    });
	    if (copyOptions.audio !== undefined) {
	        message.audio = copyOptions.audio;
	    }
	    const hasAudioProperty = Object.keys(copyOptions).some((key) => {
	        return 0 <= audioPropertyKeys.indexOf(key);
	    });
	    if (message.audio && hasAudioProperty) {
	        message.audio = {};
	        if ("audioCodecType" in copyOptions) {
	            message.audio["codec_type"] = copyOptions.audioCodecType;
	        }
	        if ("audioBitRate" in copyOptions) {
	            message.audio["bit_rate"] = copyOptions.audioBitRate;
	        }
	    }
	    const hasAudioOpusParamsProperty = Object.keys(copyOptions).some((key) => {
	        return 0 <= audioOpusParamsPropertyKeys.indexOf(key);
	    });
	    if (message.audio && hasAudioOpusParamsProperty) {
	        if (typeof message.audio != "object") {
	            message.audio = {};
	        }
	        message.audio.opus_params = {};
	        if ("audioOpusParamsChannels" in copyOptions) {
	            message.audio.opus_params.channels = copyOptions.audioOpusParamsChannels;
	        }
	        if ("audioOpusParamsClockRate" in copyOptions) {
	            message.audio.opus_params.clock_rate = copyOptions.audioOpusParamsClockRate;
	        }
	        if ("audioOpusParamsMaxplaybackrate" in copyOptions) {
	            message.audio.opus_params.maxplaybackrate = copyOptions.audioOpusParamsMaxplaybackrate;
	        }
	        if ("audioOpusParamsStereo" in copyOptions) {
	            message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo;
	        }
	        if ("audioOpusParamsSpropStereo" in copyOptions) {
	            message.audio.opus_params.sprop_stereo = copyOptions.audioOpusParamsSpropStereo;
	        }
	        if ("audioOpusParamsMinptime" in copyOptions) {
	            message.audio.opus_params.minptime = copyOptions.audioOpusParamsMinptime;
	        }
	        if ("audioOpusParamsPtime" in copyOptions) {
	            message.audio.opus_params.ptime = copyOptions.audioOpusParamsPtime;
	        }
	        if ("audioOpusParamsUseinbandfec" in copyOptions) {
	            message.audio.opus_params.useinbandfec = copyOptions.audioOpusParamsUseinbandfec;
	        }
	        if ("audioOpusParamsUsedtx" in copyOptions) {
	            message.audio.opus_params.usedtx = copyOptions.audioOpusParamsUsedtx;
	        }
	    }
	    if (copyOptions.video !== undefined) {
	        message.video = copyOptions.video;
	    }
	    const hasVideoProperty = Object.keys(copyOptions).some((key) => {
	        return 0 <= videoPropertyKeys.indexOf(key);
	    });
	    if (message.video && hasVideoProperty) {
	        message.video = {};
	        if ("videoCodecType" in copyOptions) {
	            message.video["codec_type"] = copyOptions.videoCodecType;
	        }
	        if ("videoBitRate" in copyOptions) {
	            message.video["bit_rate"] = copyOptions.videoBitRate;
	        }
	    }
	    if (message.simulcast && !enabledSimulcast() && role !== "recvonly") {
	        throw new Error("Simulcast can not be used with this browser");
	    }
	    if (options.e2ee === true) {
	        if (message.signaling_notify_metadata === undefined) {
	            message.signaling_notify_metadata = {};
	        }
	        if (message.signaling_notify_metadata === null || typeof message.signaling_notify_metadata !== "object") {
	            throw new Error("E2EE failed. Options signalingNotifyMetadata must be type 'object'");
	        }
	        if (message.video === true) {
	            message.video = {};
	        }
	        if (message.video) {
	            message.video["codec_type"] = "VP8";
	        }
	        message.e2ee = true;
	    }
	    if (Array.isArray(options.dataChannels) && 0 < options.dataChannels.length) {
	        message.data_channels = parseDataChannelConfigurations(options.dataChannels);
	    }
	    return message;
	}
	function getSignalingNotifyAuthnMetadata(message) {
	    if (message.authn_metadata !== undefined) {
	        return message.authn_metadata;
	    }
	    else if (message.metadata !== undefined) {
	        return message.metadata;
	    }
	    return null;
	}
	function getSignalingNotifyData(message) {
	    if (message.data && Array.isArray(message.data)) {
	        return message.data;
	    }
	    else if (message.metadata_list && Array.isArray(message.metadata_list)) {
	        return message.metadata_list;
	    }
	    return [];
	}
	function getPreKeyBundle(message) {
	    if (typeof message === "object" && message !== null && "pre_key_bundle" in message) {
	        return message.pre_key_bundle;
	    }
	    return null;
	}
	function trace(clientId, title, value) {
	    const dump = (record) => {
	        if (record && typeof record === "object") {
	            let keys = null;
	            try {
	                keys = Object.keys(JSON.parse(JSON.stringify(record)));
	            }
	            catch (_) {
	                // 何もしない
	            }
	            if (keys && Array.isArray(keys)) {
	                keys.forEach((key) => {
	                    console.group(key);
	                    dump(record[key]);
	                    console.groupEnd();
	                });
	            }
	            else {
	                console.info(record);
	            }
	        }
	        else {
	            console.info(record);
	        }
	    };
	    let prefix = "";
	    if (window.performance) {
	        prefix = "[" + (window.performance.now() / 1000).toFixed(3) + "]";
	    }
	    if (clientId) {
	        prefix = prefix + "[" + clientId + "]";
	    }
	    if (console.info !== undefined && console.group !== undefined) {
	        console.group(prefix + " " + title);
	        dump(value);
	        console.groupEnd();
	    }
	    else {
	        console.log(prefix + " " + title + "\n", value);
	    }
	}
	class ConnectError extends Error {
	}
	function createSignalingEvent(eventType, data, transportType) {
	    const event = new Event(eventType);
	    // data をコピーする
	    try {
	        event.data = JSON.parse(JSON.stringify(data));
	    }
	    catch (_) {
	        event.data = data;
	    }
	    event.transportType = transportType;
	    return event;
	}
	function createDataChannelData(channel) {
	    return {
	        binaryType: channel.binaryType,
	        bufferedAmount: channel.bufferedAmount,
	        bufferedAmountLowThreshold: channel.bufferedAmountLowThreshold,
	        id: channel.id,
	        label: channel.label,
	        maxPacketLifeTime: channel.maxPacketLifeTime,
	        maxRetransmits: channel.maxRetransmits,
	        negotiated: channel.negotiated,
	        ordered: channel.ordered,
	        protocol: channel.protocol,
	        readyState: channel.readyState,
	        // @ts-ignore w3c 仕様には存在しない property
	        reliable: channel.reliable,
	    };
	}
	function createTimelineEvent(eventType, data, logType, dataChannelId, dataChannelLabel) {
	    const event = new Event(eventType);
	    // data をコピーする
	    try {
	        event.data = JSON.parse(JSON.stringify(data));
	    }
	    catch (_) {
	        event.data = data;
	    }
	    event.logType = logType;
	    event.dataChannelId = dataChannelId;
	    event.dataChannelLabel = dataChannelLabel;
	    return event;
	}
	function createDataChannelMessageEvent(label, data) {
	    const event = new Event("message");
	    event.label = label;
	    event.data = data;
	    return event;
	}
	function createDataChannelEvent(channel) {
	    const event = new Event("datachannel");
	    event.datachannel = channel;
	    return event;
	}

	/**
	 * Sora との WebRTC 接続を扱う基底クラス
	 *
	 * @param signalingUrlCandidates - シグナリングに使用する URL の候補
	 * @param role - ロール
	 * @param channelId - チャネルID
	 * @param metadata - メタデータ
	 * @param options - コネクションオプション
	 * @param debug - デバッグフラグ
	 */
	class ConnectionBase {
	    constructor(signalingUrlCandidates, role, channelId, metadata, options, debug) {
	        this.role = role;
	        this.channelId = channelId;
	        this.metadata = metadata;
	        this.signalingUrlCandidates = signalingUrlCandidates;
	        this.options = options;
	        // connection timeout の初期値をセットする
	        this.connectionTimeout = 60000;
	        if (typeof this.options.timeout === "number") {
	            console.warn("@deprecated timeout option will be removed in a future version. Use connectionTimeout.");
	            this.connectionTimeout = this.options.timeout;
	        }
	        if (typeof this.options.connectionTimeout === "number") {
	            this.connectionTimeout = this.options.connectionTimeout;
	        }
	        // WebSocket/DataChannel の disconnect timeout の初期値をセットする
	        this.disconnectWaitTimeout = 3000;
	        if (typeof this.options.disconnectWaitTimeout === "number") {
	            this.disconnectWaitTimeout = this.options.disconnectWaitTimeout;
	        }
	        // signalingUrlCandidates に設定されている URL への接続チェック timeout の初期値をセットする
	        this.signalingCandidateTimeout = 3000;
	        if (typeof this.options.signalingCandidateTimeout === "number") {
	            this.signalingCandidateTimeout = this.options.signalingCandidateTimeout;
	        }
	        this.constraints = null;
	        this.debug = debug;
	        this.clientId = null;
	        this.connectionId = null;
	        this.remoteConnectionIds = [];
	        this.stream = null;
	        this.ws = null;
	        this.pc = null;
	        this.encodings = [];
	        this.callbacks = {
	            disconnect: () => { },
	            push: () => { },
	            addstream: () => { },
	            track: () => { },
	            removestream: () => { },
	            removetrack: () => { },
	            notify: () => { },
	            log: () => { },
	            timeout: () => { },
	            timeline: () => { },
	            signaling: () => { },
	            message: () => { },
	            datachannel: () => { },
	        };
	        this.authMetadata = null;
	        this.e2ee = null;
	        this.connectionTimeoutTimerId = 0;
	        this.monitorSignalingWebSocketEventTimerId = 0;
	        this.monitorIceConnectionStateChangeTimerId = 0;
	        this.soraDataChannels = {};
	        this.mids = {
	            audio: "",
	            video: "",
	        };
	        this.signalingSwitched = false;
	        this.signalingOfferMessageDataChannels = {};
	    }
	    /**
	     * SendRecv Object で発火するイベントのコールバックを設定するメソッド
	     *
	     * @example
	     * ```
	     * const sendrecv = connection.sendrecv("sora");
	     * sendrecv.on("track", (event) => {
	     *   // callback 処理
	     * });
	     * ```
	     *
	     * @remarks
	     * addstream イベントは非推奨です. track イベントを使用してください
	     *
	     * removestream イベントは非推奨です. removetrack イベントを使用してください
	     *
	     * @param kind - イベントの種類(disconnect, push, track, removetrack, notify, log, timeout, timeline, signaling, message, datachannel)
	     * @param callback - コールバック関数
	     *
	     * @public
	     */
	    on(kind, callback) {
	        // @deprecated message
	        if (kind === "addstream") {
	            console.warn("@deprecated addstream callback will be removed in a future version. Use track callback.");
	        }
	        else if (kind === "removestream") {
	            console.warn("@deprecated removestream callback will be removed in a future version. Use removetrack callback.");
	        }
	        if (kind in this.callbacks) {
	            this.callbacks[kind] = callback;
	        }
	    }
	    /**
	     * audio track を停止するメソッド
	     *
	     * @example
	     * ```
	     * const sendrecv = connection.sendrecv("sora");
	     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
	     * await sendrecv.connect(mediaStream);
	     *
	     * sendrecv.stopAudioTrack(mediaStream);
	     * ```
	     *
	     * @remarks
	     * stream の audio track を停止後、PeerConnection の senders から対象の sender を削除します
	     *
	     * @param stream - audio track を削除する MediaStream
	     *
	     * @public
	     */
	    stopAudioTrack(stream) {
	        for (const track of stream.getAudioTracks()) {
	            track.enabled = false;
	        }
	        return new Promise((resolve) => {
	            // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
	            setTimeout(async () => {
	                for (const track of stream.getAudioTracks()) {
	                    track.stop();
	                    stream.removeTrack(track);
	                    if (this.pc !== null) {
	                        const sender = this.pc.getSenders().find((s) => {
	                            return s.track && s.track.id === track.id;
	                        });
	                        if (sender) {
	                            await sender.replaceTrack(null);
	                        }
	                    }
	                }
	                resolve();
	            }, 100);
	        });
	    }
	    /**
	     * video track を停止するメソッド
	     *
	     * @example
	     * ```
	     * const sendrecv = connection.sendrecv("sora");
	     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
	     * await sendrecv.connect(mediaStream);
	     *
	     * sendrecv.stopVideoTrack(mediaStream);
	     * ```
	     *
	     * @remarks
	     * stream の video track を停止後、PeerConnection の senders から対象の sender を削除します
	     *
	     * @param stream - video track を削除する MediaStream
	     *
	     * @public
	     */
	    stopVideoTrack(stream) {
	        for (const track of stream.getVideoTracks()) {
	            track.enabled = false;
	        }
	        return new Promise((resolve) => {
	            // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
	            setTimeout(async () => {
	                for (const track of stream.getVideoTracks()) {
	                    track.stop();
	                    stream.removeTrack(track);
	                    if (this.pc !== null) {
	                        const sender = this.pc.getSenders().find((s) => {
	                            return s.track && s.track.id === track.id;
	                        });
	                        if (sender) {
	                            await sender.replaceTrack(null);
	                        }
	                    }
	                }
	                resolve();
	            }, 100);
	        });
	    }
	    /**
	     * audio track を入れ替えするメソッド
	     *
	     * @example
	     * ```
	     * const sendrecv = connection.sendrecv("sora");
	     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
	     * await sendrecv.connect(mediaStream);
	     *
	     * const replacedMediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
	     * await sendrecv.replaceAudioTrack(mediaStream, replacedMediaStream.getAudioTracks()[0]);
	     * ```
	     *
	     * @remarks
	     * stream の audio track を停止後、新しい audio track をセットします
	     *
	     * @param stream - audio track を削除する MediaStream
	     * @param audioTrack - 新しい audio track
	     *
	     * @public
	     */
	    async replaceAudioTrack(stream, audioTrack) {
	        await this.stopAudioTrack(stream);
	        const transceiver = this.getAudioTransceiver();
	        if (transceiver === null) {
	            throw new Error("Unable to set an audio track. Audio track sender is undefined");
	        }
	        stream.addTrack(audioTrack);
	        await transceiver.sender.replaceTrack(audioTrack);
	    }
	    /**
	     * video track を入れ替えするメソッド
	     *
	     * @example
	     * ```
	     * const sendrecv = connection.sendrecv("sora");
	     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
	     * await sendrecv.connect(mediaStream);
	     *
	     * const replacedMediaStream = await navigator.mediaDevices.getUserMedia({video: true});
	     * await sendrecv.replaceVideoTrack(mediaStream, replacedMediaStream.getVideoTracks()[0]);
	     * ```
	     *
	     * @remarks
	     * stream の video track を停止後、新しい video track をセットします
	     *
	     * @param stream - video track を削除する MediaStream
	     * @param videoTrack - 新しい video track
	     *
	     * @public
	     */
	    async replaceVideoTrack(stream, videoTrack) {
	        await this.stopVideoTrack(stream);
	        const transceiver = this.getVideoTransceiver();
	        if (transceiver === null) {
	            throw new Error("Unable to set video track. Video track sender is undefined");
	        }
	        stream.addTrack(videoTrack);
	        await transceiver.sender.replaceTrack(videoTrack);
	    }
	    /**
	     * stream を停止するメソッド
	     */
	    stopStream() {
	        return new Promise((resolve, _) => {
	            if (this.debug) {
	                console.warn("@deprecated closing MediaStream in disconnect will be removed in a future version. Close every track in the MediaStream by yourself.");
	            }
	            if (!this.stream) {
	                return resolve();
	            }
	            this.stream.getTracks().forEach((t) => {
	                t.stop();
	            });
	            this.stream = null;
	            return resolve();
	        });
	    }
	    /**
	     * connect 処理中に例外が発生した場合の切断処理をするメソッド
	     */
	    async signalingTerminate() {
	        await this.stopStream();
	        for (const key of Object.keys(this.soraDataChannels)) {
	            const dataChannel = this.soraDataChannels[key];
	            if (dataChannel) {
	                dataChannel.close();
	            }
	            delete this.soraDataChannels[key];
	        }
	        if (this.ws) {
	            this.ws.close();
	            this.ws = null;
	        }
	        if (this.pc) {
	            this.pc.close();
	        }
	        if (this.e2ee) {
	            this.e2ee.terminateWorker();
	        }
	        this.initializeConnection();
	    }
	    /**
	     * PeerConnection の state に異常が発生した場合の切断処理をするメソッド
	     *
	     * @param title - disconnect callback に渡すイベントのタイトル
	     */
	    async abendPeerConnectionState(title) {
	        this.clearMonitorIceConnectionStateChange();
	        await this.stopStream();
	        // callback を止める
	        if (this.pc) {
	            this.pc.ondatachannel = null;
	            this.pc.oniceconnectionstatechange = null;
	            this.pc.onicegatheringstatechange = null;
	            this.pc.onconnectionstatechange = null;
	        }
	        if (this.ws) {
	            // onclose はログを吐く専用に残す
	            this.ws.onclose = (event) => {
	                this.writeWebSocketTimelineLog("onclose", { code: event.code, reason: event.reason });
	            };
	            this.ws.onmessage = null;
	            this.ws.onerror = null;
	        }
	        for (const key of Object.keys(this.soraDataChannels)) {
	            const dataChannel = this.soraDataChannels[key];
	            if (dataChannel) {
	                // onclose はログを吐く専用に残す
	                dataChannel.onclose = (event) => {
	                    const channel = event.currentTarget;
	                    this.writeDataChannelTimelineLog("onclose", channel);
	                    this.trace("CLOSE DATA CHANNEL", channel.label);
	                };
	                dataChannel.onmessage = null;
	                dataChannel.onerror = null;
	            }
	        }
	        // DataChannel を終了する
	        for (const key of Object.keys(this.soraDataChannels)) {
	            const dataChannel = this.soraDataChannels[key];
	            if (dataChannel) {
	                dataChannel.close();
	            }
	            delete this.soraDataChannels[key];
	        }
	        // WebSocket を終了する
	        if (this.ws) {
	            this.ws.close();
	            this.ws = null;
	        }
	        // PeerConnection を終了する
	        if (this.pc) {
	            this.pc.close();
	        }
	        // E2EE worker を終了する
	        if (this.e2ee) {
	            this.e2ee.terminateWorker();
	        }
	        this.initializeConnection();
	        const event = this.soraCloseEvent("abend", title);
	        this.callbacks.disconnect(event);
	        this.writeSoraTimelineLog("disconnect-abend", event);
	    }
	    /**
	     * 何かしらの異常があった場合の切断処理
	     *
	     * @param title - disconnect callback に渡すイベントのタイトル
	     * @param params - 切断時の状況を入れる Record
	     */
	    async abend(title, params) {
	        this.clearMonitorIceConnectionStateChange();
	        await this.stopStream();
	        // callback を止める
	        if (this.pc) {
	            this.pc.ondatachannel = null;
	            this.pc.oniceconnectionstatechange = null;
	            this.pc.onicegatheringstatechange = null;
	            this.pc.onconnectionstatechange = null;
	        }
	        if (this.ws) {
	            // onclose はログを吐く専用に残す
	            this.ws.onclose = (event) => {
	                this.writeWebSocketTimelineLog("onclose", { code: event.code, reason: event.reason });
	            };
	            this.ws.onmessage = null;
	            this.ws.onerror = null;
	        }
	        for (const key of Object.keys(this.soraDataChannels)) {
	            const dataChannel = this.soraDataChannels[key];
	            if (dataChannel) {
	                // onclose はログを吐く専用に残す
	                dataChannel.onclose = (event) => {
	                    const channel = event.currentTarget;
	                    this.writeDataChannelTimelineLog("onclose", channel);
	                    this.trace("CLOSE DATA CHANNEL", channel.label);
	                };
	                dataChannel.onmessage = null;
	                dataChannel.onerror = null;
	            }
	        }
	        // 終了処理を開始する
	        if (this.soraDataChannels.signaling) {
	            const message = { type: "disconnect", reason: title };
	            if (this.signalingOfferMessageDataChannels.signaling &&
	                this.signalingOfferMessageDataChannels.signaling.compress === true) {
	                const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
	                const zlibMessage = zlibSync(binaryMessage, {});
	                if (this.soraDataChannels.signaling.readyState === "open") {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(zlibMessage);
	                        this.writeDataChannelSignalingLog("send-disconnect", this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog("failed-to-send-disconnect", this.soraDataChannels.signaling, errorMessage);
	                    }
	                }
	            }
	            else {
	                if (this.soraDataChannels.signaling.readyState === "open") {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(JSON.stringify(message));
	                        this.writeDataChannelSignalingLog("send-disconnect", this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog("failed-to-send-disconnect", this.soraDataChannels.signaling, errorMessage);
	                    }
	                }
	            }
	        }
	        for (const key of Object.keys(this.soraDataChannels)) {
	            const dataChannel = this.soraDataChannels[key];
	            if (dataChannel) {
	                dataChannel.onerror = null;
	                dataChannel.close();
	            }
	            delete this.soraDataChannels[key];
	        }
	        await this.disconnectWebSocket(title);
	        await this.disconnectPeerConnection();
	        if (this.e2ee) {
	            this.e2ee.terminateWorker();
	        }
	        this.initializeConnection();
	        if (title === "WEBSOCKET-ONCLOSE" && params && (params.code === 1000 || params.code === 1005)) {
	            const event = this.soraCloseEvent("normal", "DISCONNECT", params);
	            this.writeSoraTimelineLog("disconnect-normal", event);
	            this.callbacks.disconnect(event);
	            return;
	        }
	        const event = this.soraCloseEvent("abend", title, params);
	        this.writeSoraTimelineLog("disconnect-abend", event);
	        this.callbacks.disconnect(this.soraCloseEvent("abend", title, params));
	    }
	    /**
	     * 接続状態の初期化をするメソッド
	     */
	    initializeConnection() {
	        this.clientId = null;
	        this.connectionId = null;
	        this.remoteConnectionIds = [];
	        this.stream = null;
	        this.ws = null;
	        this.pc = null;
	        this.encodings = [];
	        this.authMetadata = null;
	        this.e2ee = null;
	        this.soraDataChannels = {};
	        this.mids = {
	            audio: "",
	            video: "",
	        };
	        this.signalingSwitched = false;
	        this.signalingOfferMessageDataChannels = {};
	        this.clearConnectionTimeout();
	    }
	    /**
	     * WebSocket を切断するメソッド
	     *
	     * @remarks
	     * 正常/異常どちらの切断でも使用する
	     *
	     * @param title - type disconnect 時の reason
	     */
	    disconnectWebSocket(title) {
	        let timerId = 0;
	        if (this.signalingSwitched) {
	            if (this.ws) {
	                this.ws.close();
	                this.ws = null;
	            }
	            return Promise.resolve(null);
	        }
	        return new Promise((resolve, _) => {
	            if (!this.ws) {
	                return resolve(null);
	            }
	            this.ws.onclose = (event) => {
	                if (this.ws) {
	                    this.ws.close();
	                    this.ws = null;
	                }
	                clearTimeout(timerId);
	                this.writeWebSocketTimelineLog("onclose", { code: event.code, reason: event.reason });
	                return resolve({ code: event.code, reason: event.reason });
	            };
	            if (this.ws.readyState === 1) {
	                const message = { type: "disconnect", reason: title };
	                this.ws.send(JSON.stringify(message));
	                this.writeWebSocketSignalingLog("send-disconnect", message);
	                // WebSocket 切断を待つ
	                timerId = setTimeout(() => {
	                    if (this.ws) {
	                        this.ws.close();
	                        this.ws = null;
	                    }
	                    resolve({ code: 1006, reason: "" });
	                }, this.disconnectWaitTimeout);
	            }
	            else {
	                // ws の state が open ではない場合は後処理をして終わる
	                this.ws.close();
	                this.ws = null;
	                return resolve(null);
	            }
	        });
	    }
	    /**
	     * DataChannel を切断するメソッド
	     *
	     * @remarks
	     * 正常/異常どちらの切断でも使用する
	     */
	    disconnectDataChannel() {
	        // DataChannel の強制終了処理
	        const closeDataChannels = () => {
	            for (const key of Object.keys(this.soraDataChannels)) {
	                const dataChannel = this.soraDataChannels[key];
	                if (dataChannel) {
	                    dataChannel.onerror = null;
	                    dataChannel.close();
	                }
	                delete this.soraDataChannels[key];
	            }
	        };
	        return new Promise((resolve, reject) => {
	            // DataChannel label signaling が存在しない場合は強制終了処理をする
	            if (!this.soraDataChannels.signaling) {
	                closeDataChannels();
	                return resolve({ code: 4999, reason: "" });
	            }
	            // disconnectWaitTimeout で指定された時間経過しても切断しない場合は強制終了処理をする
	            const disconnectWaitTimeoutId = setTimeout(() => {
	                closeDataChannels();
	                return reject();
	            }, this.disconnectWaitTimeout);
	            const onClosePromises = [];
	            for (const key of Object.keys(this.soraDataChannels)) {
	                const dataChannel = this.soraDataChannels[key];
	                if (dataChannel) {
	                    // onerror が発火した場合は強制終了処理をする
	                    dataChannel.onerror = () => {
	                        clearTimeout(disconnectWaitTimeoutId);
	                        closeDataChannels();
	                        return resolve({ code: 4999, reason: "" });
	                    };
	                    // すべての DataChannel の readyState が "closed" になったことを確認する Promsie を生成する
	                    const p = () => {
	                        return new Promise((res, _) => {
	                            // disconnectWaitTimeout 時間を過ぎた場合に終了させるための counter を作成する
	                            let counter = 0;
	                            // onclose 内で readyState の変化を待つと非同期のまま複数回 disconnect を呼んだ場合に
	                            // callback が上書きされて必ず DISCONNECT-TIMEOUT になってしまうので setInterval を使う
	                            const timerId = setInterval(() => {
	                                counter++;
	                                if (dataChannel.readyState === "closed") {
	                                    clearInterval(timerId);
	                                    res();
	                                }
	                                if (this.disconnectWaitTimeout < counter * 100) {
	                                    res();
	                                    clearInterval(timerId);
	                                }
	                            }, 100);
	                        });
	                    };
	                    onClosePromises.push(p());
	                }
	            }
	            // すべての DataChannel で onclose が発火した場合は resolve にする
	            Promise.all(onClosePromises)
	                .then(() => {
	                // dataChannels が空の場合は切断処理が終わっているとみなす
	                if (0 === Object.keys(this.soraDataChannels).length) {
	                    resolve(null);
	                }
	                else {
	                    resolve({ code: 4999, reason: "" });
	                }
	            })
	                .finally(() => {
	                closeDataChannels();
	                clearTimeout(disconnectWaitTimeoutId);
	            });
	            const message = { type: "disconnect", reason: "NO-ERROR" };
	            if (this.signalingOfferMessageDataChannels.signaling &&
	                this.signalingOfferMessageDataChannels.signaling.compress === true) {
	                const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
	                const zlibMessage = zlibSync(binaryMessage, {});
	                if (this.soraDataChannels.signaling.readyState === "open") {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(zlibMessage);
	                        this.writeDataChannelSignalingLog("send-disconnect", this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog("failed-to-send-disconnect", this.soraDataChannels.signaling, errorMessage);
	                    }
	                }
	            }
	            else {
	                if (this.soraDataChannels.signaling.readyState === "open") {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(JSON.stringify(message));
	                        this.writeDataChannelSignalingLog("send-disconnect", this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog("failed-to-send-disconnect", this.soraDataChannels.signaling, errorMessage);
	                    }
	                }
	            }
	        });
	    }
	    /**
	     * PeerConnection を切断するメソッド
	     *
	     * @remarks
	     * 正常/異常どちらの切断でも使用する
	     */
	    disconnectPeerConnection() {
	        return new Promise((resolve, _) => {
	            if (this.pc && this.pc.connectionState !== "closed") {
	                this.pc.close();
	            }
	            return resolve();
	        });
	    }
	    /**
	     * 切断処理をするメソッド
	     *
	     * @example
	     * ```
	     * await sendrecv.disconnect();
	     * ```
	     *
	     * @public
	     */
	    async disconnect() {
	        this.clearMonitorIceConnectionStateChange();
	        await this.stopStream();
	        // callback を止める
	        if (this.pc) {
	            this.pc.ondatachannel = null;
	            this.pc.oniceconnectionstatechange = null;
	            this.pc.onicegatheringstatechange = null;
	            this.pc.onconnectionstatechange = null;
	        }
	        if (this.ws) {
	            // onclose はログを吐く専用に残す
	            this.ws.onclose = (event) => {
	                this.writeWebSocketTimelineLog("onclose", { code: event.code, reason: event.reason });
	            };
	            this.ws.onmessage = null;
	            this.ws.onerror = null;
	        }
	        for (const key of Object.keys(this.soraDataChannels)) {
	            const dataChannel = this.soraDataChannels[key];
	            if (dataChannel) {
	                dataChannel.onmessage = null;
	                // onclose はログを吐く専用に残す
	                dataChannel.onclose = (event) => {
	                    const channel = event.currentTarget;
	                    this.writeDataChannelTimelineLog("onclose", channel);
	                    this.trace("CLOSE DATA CHANNEL", channel.label);
	                };
	            }
	        }
	        let event = null;
	        if (this.signalingSwitched) {
	            // DataChannel の切断処理がタイムアウトした場合は event を abend に差し替える
	            try {
	                const reason = await this.disconnectDataChannel();
	                if (reason !== null) {
	                    event = this.soraCloseEvent("normal", "DISCONNECT", reason);
	                }
	            }
	            catch (_) {
	                event = this.soraCloseEvent("abend", "DISCONNECT-TIMEOUT");
	            }
	            await this.disconnectWebSocket("NO-ERROR");
	            await this.disconnectPeerConnection();
	        }
	        else {
	            const reason = await this.disconnectWebSocket("NO-ERROR");
	            await this.disconnectPeerConnection();
	            if (reason !== null) {
	                event = this.soraCloseEvent("normal", "DISCONNECT", reason);
	            }
	        }
	        if (this.e2ee) {
	            this.e2ee.terminateWorker();
	        }
	        this.initializeConnection();
	        if (event) {
	            if (event.type === "abend") {
	                this.writeSoraTimelineLog("disconnect-abend", event);
	            }
	            else if (event.type === "normal") {
	                this.writeSoraTimelineLog("disconnect-normal", event);
	            }
	            this.callbacks.disconnect(event);
	        }
	    }
	    /**
	     * E2EE の初期設定をするメソッド
	     */
	    setupE2EE() {
	        if (this.options.e2ee === true) {
	            this.e2ee = new SoraE2EE();
	            this.e2ee.onWorkerDisconnect = async () => {
	                await this.abend("INTERNAL-ERROR", { reason: "CRASH-E2EE-WORKER" });
	            };
	            this.e2ee.startWorker();
	        }
	    }
	    /**
	     * E2EE を開始するメソッド
	     */
	    startE2EE() {
	        if (this.options.e2ee === true && this.e2ee) {
	            if (!this.connectionId) {
	                const error = new Error();
	                error.message = `E2EE failed. Self connectionId is null`;
	                throw error;
	            }
	            this.e2ee.clearWorker();
	            const result = this.e2ee.start(this.connectionId);
	            this.e2ee.postSelfSecretKeyMaterial(this.connectionId, result.selfKeyId, result.selfSecretKeyMaterial);
	        }
	    }
	    /**
	     * シグナリングに使う WebSocket インスタンスを作成するメソッド
	     *
	     * @remarks
	     * シグナリング候補の URL 一覧に順に接続します
	     *
	     * 接続できた URL がない場合は例外が発生します
	     *
	     * @param signalingUrlCandidates - シグナリング候補の URL. 後方互換のため string | string[] を受け取る
	     *
	     * @returns
	     * 接続できた WebScoket インスタンスを返します
	     */
	    async getSignalingWebSocket(signalingUrlCandidates) {
	        if (typeof signalingUrlCandidates === "string") {
	            // signaling url の候補が文字列の場合
	            const signalingUrl = signalingUrlCandidates;
	            return new Promise((resolve, reject) => {
	                const ws = new WebSocket(signalingUrl);
	                ws.onclose = (event) => {
	                    const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                    error.code = event.code;
	                    error.reason = event.reason;
	                    this.writeWebSocketTimelineLog("onclose", error);
	                    reject(error);
	                };
	                ws.onopen = (_) => {
	                    resolve(ws);
	                };
	            });
	        }
	        else if (Array.isArray(signalingUrlCandidates)) {
	            // signaling url の候補が Array の場合
	            // すでに候補の WebSocket が発見されているかどうかのフラグ
	            let resolved = false;
	            const testSignalingUrlCandidate = (signalingUrl) => {
	                return new Promise((resolve, reject) => {
	                    const ws = new WebSocket(signalingUrl);
	                    // 一定時間経過しても反応がなかった場合は処理を中断する
	                    const timerId = setTimeout(() => {
	                        this.writeWebSocketSignalingLog("signaling-url-canidate", {
	                            type: "timeout",
	                            url: ws.url,
	                        });
	                        if (ws && !resolved) {
	                            ws.onclose = null;
	                            ws.onerror = null;
	                            ws.onopen = null;
	                            ws.close();
	                            reject();
	                        }
	                    }, this.signalingCandidateTimeout);
	                    ws.onclose = (event) => {
	                        this.writeWebSocketSignalingLog("signaling-url-canidate", {
	                            type: "close",
	                            url: ws.url,
	                            message: `WebSocket closed`,
	                            code: event.code,
	                            reason: event.reason,
	                        });
	                        if (ws) {
	                            ws.close();
	                        }
	                        clearInterval(timerId);
	                        reject();
	                    };
	                    ws.onerror = (_) => {
	                        this.writeWebSocketSignalingLog("signaling-url-canidate", {
	                            type: "error",
	                            url: ws.url,
	                            message: `Failed to connect WebSocket`,
	                        });
	                        if (ws) {
	                            ws.onclose = null;
	                            ws.close();
	                        }
	                        clearInterval(timerId);
	                        reject();
	                    };
	                    ws.onopen = (_) => {
	                        if (ws) {
	                            clearInterval(timerId);
	                            if (resolved) {
	                                this.writeWebSocketSignalingLog("signaling-url-canidate", {
	                                    type: "open",
	                                    url: ws.url,
	                                    selected: false,
	                                });
	                                ws.onerror = null;
	                                ws.onclose = null;
	                                ws.onopen = null;
	                                ws.close();
	                                reject();
	                            }
	                            else {
	                                this.writeWebSocketSignalingLog("signaling-url-canidate", {
	                                    type: "open",
	                                    url: ws.url,
	                                    selected: true,
	                                });
	                                ws.onerror = null;
	                                ws.onclose = null;
	                                ws.onopen = null;
	                                resolved = true;
	                                resolve(ws);
	                            }
	                        }
	                    };
	                });
	            };
	            try {
	                return await Promise.any(signalingUrlCandidates.map((signalingUrl) => testSignalingUrlCandidate(signalingUrl)));
	            }
	            catch (e) {
	                throw new ConnectError("Signaling failed. All signaling URL candidates failed to connect");
	            }
	        }
	        throw new ConnectError("Signaling failed. Invalid format signaling URL candidates");
	    }
	    /**
	     * シグナリング処理を行うメソッド
	     *
	     * @remarks
	     * シグナリング候補の URL 一覧に順に接続します
	     *
	     * 接続できた URL がない場合は例外が発生します
	     *
	     * @param ws - WebSocket インスタンス
	     * @param redirect - クラスター接続時にリダイレクトされた場合のフラグ
	     *
	     * @returns
	     * Sora から受け取った type offer メッセージを返します
	     */
	    async signaling(ws, redirect = false) {
	        const offer = await this.createOffer();
	        this.trace("CREATE OFFER", offer);
	        return new Promise((resolve, reject) => {
	            this.writeWebSocketSignalingLog("new-websocket", ws.url);
	            // websocket の各 callback を設定する
	            ws.binaryType = "arraybuffer";
	            ws.onclose = async (event) => {
	                const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                error.code = event.code;
	                error.reason = event.reason;
	                this.writeWebSocketTimelineLog("onclose", error);
	                await this.signalingTerminate();
	                reject(error);
	            };
	            ws.onmessage = async (event) => {
	                // E2EE 時専用処理
	                if (event.data instanceof ArrayBuffer) {
	                    this.writeWebSocketSignalingLog("onmessage-e2ee", event.data);
	                    this.signalingOnMessageE2EE(event.data);
	                    return;
	                }
	                const message = JSON.parse(event.data);
	                if (message.type == "offer") {
	                    this.writeWebSocketSignalingLog("onmessage-offer", message);
	                    this.signalingOnMessageTypeOffer(message);
	                    resolve(message);
	                }
	                else if (message.type == "update") {
	                    this.writeWebSocketSignalingLog("onmessage-update", message);
	                    await this.signalingOnMessageTypeUpdate(message);
	                }
	                else if (message.type == "re-offer") {
	                    this.writeWebSocketSignalingLog("onmessage-re-offer", message);
	                    await this.signalingOnMessageTypeReOffer(message);
	                }
	                else if (message.type == "ping") {
	                    await this.signalingOnMessageTypePing(message);
	                }
	                else if (message.type == "push") {
	                    this.callbacks.push(message, "websocket");
	                }
	                else if (message.type == "notify") {
	                    if (message.event_type === "connection.created") {
	                        this.writeWebSocketTimelineLog("notify-connection.created", message);
	                    }
	                    else if (message.event_type === "connection.destroyed") {
	                        this.writeWebSocketTimelineLog("notify-connection.destroyed", message);
	                    }
	                    this.signalingOnMessageTypeNotify(message, "websocket");
	                }
	                else if (message.type == "switched") {
	                    this.writeWebSocketSignalingLog("onmessage-switched", message);
	                    this.signalingOnMessageTypeSwitched(message);
	                }
	                else if (message.type == "redirect") {
	                    this.writeWebSocketSignalingLog("onmessage-redirect", message);
	                    const redirectMessage = await this.signalingOnMessageTypeRedirect(message);
	                    resolve(redirectMessage);
	                }
	            };
	            // eslint-disable-next-line @typescript-eslint/no-floating-promises
	            (async () => {
	                let signalingMessage;
	                try {
	                    signalingMessage = createSignalingMessage(offer.sdp || "", this.role, this.channelId, this.metadata, this.options, redirect);
	                }
	                catch (error) {
	                    reject(error);
	                    return;
	                }
	                if (signalingMessage.e2ee && this.e2ee) {
	                    const initResult = await this.e2ee.init();
	                    // @ts-ignore signalingMessage の e2ee が true の場合は signalingNotifyMetadata が必ず object になる
	                    signalingMessage["signaling_notify_metadata"]["pre_key_bundle"] = initResult;
	                }
	                this.trace("SIGNALING CONNECT MESSAGE", signalingMessage);
	                if (ws) {
	                    ws.send(JSON.stringify(signalingMessage));
	                    this.writeWebSocketSignalingLog(`send-${signalingMessage.type}`, signalingMessage);
	                    this.ws = ws;
	                }
	            })();
	        });
	    }
	    /**
	     * PeerConnection 接続処理をするメソッド
	     *
	     * @param message - シグナリング処理で受け取った type offer メッセージ
	     */
	    async connectPeerConnection(message) {
	        let config = Object.assign({}, message.config);
	        if (this.e2ee) {
	            // @ts-ignore https://w3c.github.io/webrtc-encoded-transform/#specification
	            config = Object.assign({ encodedInsertableStreams: true }, config);
	        }
	        if (window.RTCPeerConnection.generateCertificate !== undefined) {
	            const certificate = await window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
	            config = Object.assign({ certificates: [certificate] }, config);
	        }
	        this.trace("PEER CONNECTION CONFIG", config);
	        this.writePeerConnectionTimelineLog("new-peerconnection", config);
	        // @ts-ignore Chrome の場合は第2引数に goog オプションを渡すことができる
	        this.pc = new window.RTCPeerConnection(config, this.constraints);
	        this.pc.oniceconnectionstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog("oniceconnectionstatechange", {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	                this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
	            }
	        };
	        this.pc.onicegatheringstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog("onicegatheringstatechange", {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	            }
	        };
	        this.pc.onconnectionstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog("onconnectionstatechange", {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	            }
	        };
	        this.pc.ondatachannel = (event) => {
	            this.onDataChannel(event);
	        };
	        return;
	    }
	    /**
	     * setRemoteDescription 処理を行うメソッド
	     *
	     * @param message - シグナリング処理で受け取った type offer | type update | type re-offer メッセージ
	     */
	    async setRemoteDescription(message) {
	        if (!this.pc) {
	            return;
	        }
	        const sessionDescription = new RTCSessionDescription({ type: "offer", sdp: message.sdp });
	        await this.pc.setRemoteDescription(sessionDescription);
	        this.writePeerConnectionTimelineLog("set-remote-description", sessionDescription);
	        return;
	    }
	    /**
	     * createAnswer 処理を行うメソッド
	     *
	     * @remarks
	     * サイマルキャスト用の setParameters 処理もここで行う
	     *
	     * @param message - シグナリング処理で受け取った type offer | type update | type re-offer メッセージ
	     */
	    async createAnswer(message) {
	        if (!this.pc) {
	            return;
	        }
	        // mid と transceiver.direction を合わせる
	        for (const mid of Object.values(this.mids)) {
	            const transceiver = this.pc.getTransceivers().find((t) => t.mid === mid);
	            if (transceiver && transceiver.direction === "recvonly") {
	                transceiver.direction = "sendrecv";
	            }
	        }
	        // simulcast の場合
	        if (this.options.simulcast && (this.role === "sendrecv" || this.role === "sendonly")) {
	            const transceiver = this.pc.getTransceivers().find((t) => {
	                if (t.mid === null) {
	                    return;
	                }
	                if (t.sender.track === null) {
	                    return;
	                }
	                if (t.currentDirection !== null && t.currentDirection !== "sendonly") {
	                    return;
	                }
	                if (this.mids.video !== "" && this.mids.video === t.mid) {
	                    return t;
	                }
	                if (0 <= t.mid.indexOf("video")) {
	                    return t;
	                }
	            });
	            if (transceiver) {
	                await this.setSenderParameters(transceiver, this.encodings);
	                await this.setRemoteDescription(message);
	                this.trace("TRANSCEIVER SENDER GET_PARAMETERS", transceiver.sender.getParameters());
	                // setRemoteDescription 後でないと active が反映されないのでもう一度呼ぶ
	                await this.setSenderParameters(transceiver, this.encodings);
	                const sessionDescription = await this.pc.createAnswer();
	                await this.pc.setLocalDescription(sessionDescription);
	                this.trace("TRANSCEIVER SENDER GET_PARAMETERS", transceiver.sender.getParameters());
	                return;
	            }
	        }
	        const sessionDescription = await this.pc.createAnswer();
	        this.writePeerConnectionTimelineLog("create-answer", sessionDescription);
	        await this.pc.setLocalDescription(sessionDescription);
	        this.writePeerConnectionTimelineLog("set-local-description", sessionDescription);
	        return;
	    }
	    /**
	     * シグナリングサーバーに type answer を投げるメソッド
	     */
	    sendAnswer() {
	        if (this.pc && this.ws && this.pc.localDescription) {
	            this.trace("ANSWER SDP", this.pc.localDescription.sdp);
	            const message = { type: "answer", sdp: this.pc.localDescription.sdp };
	            this.ws.send(JSON.stringify(message));
	            this.writeWebSocketSignalingLog("send-answer", message);
	        }
	        return;
	    }
	    /**
	     * iceCnadidate 処理をするメソッド
	     */
	    onIceCandidate() {
	        return new Promise((resolve, _) => {
	            if (this.pc) {
	                this.pc.oniceconnectionstatechange = (_) => {
	                    if (this.pc) {
	                        this.writePeerConnectionTimelineLog("oniceconnectionstatechange", {
	                            connectionState: this.pc.connectionState,
	                            iceConnectionState: this.pc.iceConnectionState,
	                            iceGatheringState: this.pc.iceGatheringState,
	                        });
	                        this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
	                        if (this.pc.iceConnectionState === "connected") {
	                            resolve();
	                        }
	                    }
	                };
	                this.pc.onicecandidate = (event) => {
	                    this.writePeerConnectionTimelineLog("onicecandidate", event.candidate);
	                    if (this.pc) {
	                        this.trace("ONICECANDIDATE ICEGATHERINGSTATE", this.pc.iceGatheringState);
	                    }
	                    // TODO(yuito): Firefox は <empty string> を投げてくるようになったので対応する
	                    if (event.candidate === null) {
	                        resolve();
	                    }
	                    else {
	                        const candidate = event.candidate.toJSON();
	                        const message = Object.assign(candidate, { type: "candidate" });
	                        this.trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
	                        this.sendSignalingMessage(message);
	                    }
	                };
	            }
	        });
	    }
	    /**
	     * connectionState が "connected" になるのを監視するメソッド
	     *
	     * @remarks
	     * PeerConnection.connectionState が実装されていない場合は何もしない
	     */
	    waitChangeConnectionStateConnected() {
	        return new Promise((resolve, reject) => {
	            // connectionState が存在しない場合はそのまま抜ける
	            if (this.pc && this.pc.connectionState === undefined) {
	                resolve();
	                return;
	            }
	            const timerId = setInterval(() => {
	                if (!this.pc) {
	                    const error = new Error();
	                    error.message = "PeerConnection connectionState did not change to 'connected'";
	                    clearInterval(timerId);
	                    reject(error);
	                }
	                else if (this.pc && this.pc.connectionState === "connected") {
	                    clearInterval(timerId);
	                    resolve();
	                }
	            }, 10);
	        });
	    }
	    /**
	     * 初回シグナリング接続時の WebSocket の切断を監視するメソッド
	     *
	     * @remarks
	     * 意図しない切断があった場合には異常終了処理を実行する
	     */
	    monitorSignalingWebSocketEvent() {
	        return new Promise((_, reject) => {
	            this.monitorSignalingWebSocketEventTimerId = setInterval(() => {
	                if (!this.ws) {
	                    return;
	                }
	                this.clearMonitorSignalingWebSocketEvent();
	                this.ws.onclose = async (event) => {
	                    const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                    error.code = event.code;
	                    error.reason = event.reason;
	                    this.writeWebSocketTimelineLog("onclose", error);
	                    await this.signalingTerminate();
	                    reject(error);
	                };
	                this.ws.onerror = async (_) => {
	                    const error = new ConnectError(`Signaling failed. WebSocket onerror was called`);
	                    this.writeWebSocketSignalingLog("onerror", error);
	                    await this.signalingTerminate();
	                    reject(error);
	                };
	            }, 100);
	        });
	    }
	    /**
	     * WebSocket の切断を監視するメソッド
	     *
	     * @remarks
	     * 意図しない切断があった場合には異常終了処理を実行する
	     */
	    monitorWebSocketEvent() {
	        if (!this.ws) {
	            return;
	        }
	        this.ws.onclose = async (event) => {
	            this.writeWebSocketTimelineLog("onclose", { code: event.code, reason: event.reason });
	            await this.abend("WEBSOCKET-ONCLOSE", { code: event.code, reason: event.reason });
	        };
	        this.ws.onerror = async (_) => {
	            this.writeWebSocketSignalingLog("onerror");
	            await this.abend("WEBSOCKET-ONERROR");
	        };
	    }
	    /**
	     * 初回シグナリング後 PeerConnection の state を監視するメソッド
	     *
	     * @remarks
	     * connectionState, iceConnectionState を監視して不正な場合に切断する
	     */
	    monitorPeerConnectionState() {
	        if (!this.pc) {
	            return;
	        }
	        this.pc.oniceconnectionstatechange = async (_) => {
	            // connectionState が undefined の場合は iceConnectionState を見て判定する
	            if (this.pc && this.pc.connectionState === undefined) {
	                this.writePeerConnectionTimelineLog("oniceconnectionstatechange", {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	                this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
	                clearTimeout(this.monitorIceConnectionStateChangeTimerId);
	                // iceConnectionState "failed" で切断する
	                if (this.pc.iceConnectionState === "failed") {
	                    await this.abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED");
	                }
	                // iceConnectionState "disconnected" になってから 10000ms の間変化がない場合切断する
	                else if (this.pc.iceConnectionState === "disconnected") {
	                    this.monitorIceConnectionStateChangeTimerId = setTimeout(async () => {
	                        if (this.pc && this.pc.iceConnectionState === "disconnected") {
	                            await this.abendPeerConnectionState("ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT");
	                        }
	                    }, 10000);
	                }
	            }
	        };
	        this.pc.onconnectionstatechange = async (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog("onconnectionstatechange", {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	                if (this.pc.connectionState === "failed") {
	                    await this.abendPeerConnectionState("CONNECTION-STATE-FAILED");
	                }
	            }
	        };
	    }
	    /**
	     * 初回シグナリングの接続タイムアウト処理をするメソッド
	     */
	    setConnectionTimeout() {
	        return new Promise((_, reject) => {
	            if (0 < this.connectionTimeout) {
	                this.connectionTimeoutTimerId = setTimeout(async () => {
	                    if (!this.pc ||
	                        (this.pc && this.pc.connectionState !== undefined && this.pc.connectionState !== "connected")) {
	                        const error = new Error();
	                        error.message = "Signaling connection timeout";
	                        this.callbacks.timeout();
	                        this.trace("DISCONNECT", "Signaling connection timeout");
	                        this.writePeerConnectionTimelineLog("signaling-connection-timeout", {
	                            connectionTimeout: this.connectionTimeout,
	                        });
	                        await this.signalingTerminate();
	                        reject(error);
	                    }
	                }, this.connectionTimeout);
	            }
	        });
	    }
	    /**
	     * setConnectionTimeout でセットしたタイマーを止めるメソッド
	     */
	    clearConnectionTimeout() {
	        clearTimeout(this.connectionTimeoutTimerId);
	    }
	    /**
	     * monitorSignalingWebSocketEvent でセットしたタイマーを止めるメソッド
	     */
	    clearMonitorSignalingWebSocketEvent() {
	        clearInterval(this.monitorSignalingWebSocketEventTimerId);
	    }
	    /**
	     * monitorPeerConnectionState でセットしたタイマーを止めるメソッド
	     */
	    clearMonitorIceConnectionStateChange() {
	        clearInterval(this.monitorIceConnectionStateChangeTimerId);
	    }
	    /**
	     * trace log を出力するメソッド
	     *
	     * @param title - ログのタイトル
	     * @param message - ログの本文
	     */
	    trace(title, message) {
	        this.callbacks.log(title, message);
	        if (!this.debug) {
	            return;
	        }
	        trace(this.clientId, title, message);
	    }
	    /**
	     * WebSocket のシグナリングログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeWebSocketSignalingLog(eventType, data) {
	        this.callbacks.signaling(createSignalingEvent(eventType, data, "websocket"));
	        this.writeWebSocketTimelineLog(eventType, data);
	    }
	    /**
	     * DataChannel のシグナリングログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeDataChannelSignalingLog(eventType, channel, data) {
	        this.callbacks.signaling(createSignalingEvent(eventType, data, "datachannel"));
	        this.writeDataChannelTimelineLog(eventType, channel, data);
	    }
	    /**
	     * WebSocket のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeWebSocketTimelineLog(eventType, data) {
	        const event = createTimelineEvent(eventType, data, "websocket");
	        this.callbacks.timeline(event);
	    }
	    /**
	     * DataChannel のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeDataChannelTimelineLog(eventType, channel, data) {
	        const event = createTimelineEvent(eventType, data, "datachannel", channel.id, channel.label);
	        this.callbacks.timeline(event);
	    }
	    /**
	     * PeerConnection のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writePeerConnectionTimelineLog(eventType, data) {
	        const event = createTimelineEvent(eventType, data, "peerconnection");
	        this.callbacks.timeline(event);
	    }
	    /**
	     * Sora との接続のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeSoraTimelineLog(eventType, data) {
	        const event = createTimelineEvent(eventType, data, "sora");
	        this.callbacks.timeline(event);
	    }
	    /**
	     * createOffer 処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     *
	     * @returns
	     * 生成した RTCSessionDescription を返します
	     */
	    async createOffer() {
	        const config = { iceServers: [] };
	        const pc = new window.RTCPeerConnection(config);
	        if (isSafari()) {
	            pc.addTransceiver("video", { direction: "recvonly" });
	            pc.addTransceiver("audio", { direction: "recvonly" });
	            const offer = await pc.createOffer();
	            pc.close();
	            this.writePeerConnectionTimelineLog("create-offer", offer);
	            return offer;
	        }
	        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
	        pc.close();
	        this.writePeerConnectionTimelineLog("create-offer", offer);
	        return offer;
	    }
	    /**
	     * シグナリングサーバーから受け取った type e2ee メッセージを処理をするメソッド
	     *
	     * @param data - E2EE 用バイナリメッセージ
	     */
	    signalingOnMessageE2EE(data) {
	        if (this.e2ee) {
	            const message = new Uint8Array(data);
	            const result = this.e2ee.receiveMessage(message);
	            this.e2ee.postRemoteSecretKeyMaterials(result);
	            result.messages.forEach((message) => {
	                this.sendE2EEMessage(message.buffer);
	            });
	        }
	    }
	    /**
	     * シグナリングサーバーから受け取った type offer メッセージを処理をするメソッド
	     *
	     * @param message - type offer メッセージ
	     */
	    signalingOnMessageTypeOffer(message) {
	        this.clientId = message.client_id;
	        this.connectionId = message.connection_id;
	        if (message.metadata !== undefined) {
	            this.authMetadata = message.metadata;
	        }
	        if (Array.isArray(message.encodings)) {
	            this.encodings = message.encodings;
	        }
	        if (message.mid !== undefined && message.mid.audio !== undefined) {
	            this.mids.audio = message.mid.audio;
	        }
	        if (message.mid !== undefined && message.mid.video !== undefined) {
	            this.mids.video = message.mid.video;
	        }
	        if (message.data_channels) {
	            for (const dc of message.data_channels) {
	                this.signalingOfferMessageDataChannels[dc.label] = dc;
	            }
	        }
	        this.trace("SIGNALING OFFER MESSAGE", message);
	        this.trace("OFFER SDP", message.sdp);
	    }
	    /**
	     * シグナリングサーバーに type update を投げるメソッド
	     */
	    sendUpdateAnswer() {
	        if (this.pc && this.ws && this.pc.localDescription) {
	            this.trace("ANSWER SDP", this.pc.localDescription.sdp);
	            this.sendSignalingMessage({ type: "update", sdp: this.pc.localDescription.sdp });
	        }
	    }
	    /**
	     * シグナリングサーバーに type re-answer を投げるメソッド
	     */
	    sendReAnswer() {
	        if (this.pc && this.pc.localDescription) {
	            this.trace("RE ANSWER SDP", this.pc.localDescription.sdp);
	            this.sendSignalingMessage({ type: "re-answer", sdp: this.pc.localDescription.sdp });
	        }
	    }
	    /**
	     * シグナリングサーバーから受け取った type update メッセージを処理をするメソッド
	     *
	     * @param message - type update メッセージ
	     */
	    async signalingOnMessageTypeUpdate(message) {
	        this.trace("SIGNALING UPDATE MESSGE", message);
	        this.trace("UPDATE SDP", message.sdp);
	        await this.setRemoteDescription(message);
	        await this.createAnswer(message);
	        this.sendUpdateAnswer();
	    }
	    /**
	     * シグナリングサーバーから受け取った type re-offer メッセージを処理をするメソッド
	     *
	     * @param message - type re-offer メッセージ
	     */
	    async signalingOnMessageTypeReOffer(message) {
	        this.trace("SIGNALING RE OFFER MESSGE", message);
	        this.trace("RE OFFER SDP", message.sdp);
	        await this.setRemoteDescription(message);
	        await this.createAnswer(message);
	        this.sendReAnswer();
	    }
	    /**
	     * シグナリングサーバーから受け取った type ping メッセージを処理をするメソッド
	     *
	     * @param message - type ping メッセージ
	     */
	    async signalingOnMessageTypePing(message) {
	        const pongMessage = { type: "pong" };
	        if (message.stats) {
	            const stats = await this.getStats();
	            pongMessage.stats = stats;
	        }
	        if (this.ws) {
	            this.ws.send(JSON.stringify(pongMessage));
	        }
	    }
	    /**
	     * シグナリングサーバーから受け取った type notify メッセージを処理をするメソッド
	     *
	     * @param message - type notify メッセージ
	     */
	    signalingOnMessageTypeNotify(message, transportType) {
	        if (message.event_type === "connection.created") {
	            const connectionId = message.connection_id;
	            if (this.connectionId !== connectionId) {
	                const authnMetadata = getSignalingNotifyAuthnMetadata(message);
	                const preKeyBundle = getPreKeyBundle(authnMetadata);
	                if (preKeyBundle && this.e2ee && connectionId) {
	                    const result = this.e2ee.startSession(connectionId, preKeyBundle);
	                    this.e2ee.postRemoteSecretKeyMaterials(result);
	                    result.messages.forEach((message) => {
	                        this.sendE2EEMessage(message.buffer);
	                    });
	                    // messages を送信し終えてから、selfSecretKeyMaterial を更新する
	                    this.e2ee.postSelfSecretKeyMaterial(result.selfConnectionId, result.selfKeyId, result.selfSecretKeyMaterial);
	                }
	            }
	            const data = getSignalingNotifyData(message);
	            data.forEach((metadata) => {
	                const authnMetadata = getSignalingNotifyAuthnMetadata(metadata);
	                const preKeyBundle = getPreKeyBundle(authnMetadata);
	                const connectionId = metadata.connection_id;
	                if (connectionId && this.e2ee && preKeyBundle) {
	                    this.e2ee.addPreKeyBundle(connectionId, preKeyBundle);
	                }
	            });
	        }
	        else if (message.event_type === "connection.destroyed") {
	            const authnMetadata = getSignalingNotifyAuthnMetadata(message);
	            const preKeyBundle = getPreKeyBundle(authnMetadata);
	            const connectionId = message.connection_id;
	            if (preKeyBundle && this.e2ee && connectionId) {
	                const result = this.e2ee.stopSession(connectionId);
	                this.e2ee.postSelfSecretKeyMaterial(result.selfConnectionId, result.selfKeyId, result.selfSecretKeyMaterial, 5000);
	                result.messages.forEach((message) => {
	                    this.sendE2EEMessage(message.buffer);
	                });
	                this.e2ee.postRemoveRemoteDeriveKey(connectionId);
	            }
	        }
	        this.callbacks.notify(message, transportType);
	    }
	    /**
	     * シグナリングサーバーから受け取った type switched メッセージを処理をするメソッド
	     *
	     * @param message - type switched メッセージ
	     */
	    signalingOnMessageTypeSwitched(message) {
	        this.signalingSwitched = true;
	        if (!this.ws) {
	            return;
	        }
	        if (message["ignore_disconnect_websocket"]) {
	            if (this.ws) {
	                this.ws.onclose = null;
	                this.ws.close();
	                this.ws = null;
	            }
	            this.writeWebSocketSignalingLog("close");
	        }
	        for (const channel of this.datachannels) {
	            this.callbacks.datachannel(createDataChannelEvent(channel));
	        }
	    }
	    /**
	     * シグナリングサーバーから受け取った type redirect メッセージを処理をするメソッド
	     *
	     * @param message - type redirect メッセージ
	     */
	    async signalingOnMessageTypeRedirect(message) {
	        if (this.ws) {
	            this.ws.onclose = null;
	            this.ws.onerror = null;
	            this.ws.close();
	            this.ws = null;
	        }
	        const ws = await this.getSignalingWebSocket(message.location);
	        const signalingMessage = await this.signaling(ws, true);
	        return signalingMessage;
	    }
	    /**
	     * sender の parameters に encodings をセットするメソッド
	     *
	     * @remarks
	     * サイマルキャスト用の処理
	     */
	    async setSenderParameters(transceiver, encodings) {
	        const originalParameters = transceiver.sender.getParameters();
	        // @ts-ignore
	        originalParameters.encodings = encodings;
	        await transceiver.sender.setParameters(originalParameters);
	        this.trace("TRANSCEIVER SENDER SET_PARAMETERS", originalParameters);
	        this.writePeerConnectionTimelineLog("transceiver-sender-set-parameters", originalParameters);
	        return;
	    }
	    /**
	     * PeerConnection から RTCStatsReport を取得するためのメソッド
	     */
	    async getStats() {
	        const stats = [];
	        if (!this.pc) {
	            return stats;
	        }
	        const reports = await this.pc.getStats();
	        reports.forEach((s) => {
	            stats.push(s);
	        });
	        return stats;
	    }
	    /**
	     * PeerConnection の ondatachannel callback メソッド
	     *
	     * @param dataChannelEvent - DataChannel イベント
	     */
	    onDataChannel(dataChannelEvent) {
	        const dataChannel = dataChannelEvent.channel;
	        this.writeDataChannelTimelineLog("ondatachannel", dataChannel, createDataChannelData(dataChannel));
	        // onbufferedamountlow
	        dataChannelEvent.channel.onbufferedamountlow = (event) => {
	            const channel = event.currentTarget;
	            this.writeDataChannelTimelineLog("onbufferedamountlow", channel);
	        };
	        // onopen
	        dataChannelEvent.channel.onopen = (event) => {
	            const channel = event.currentTarget;
	            channel.bufferedAmountLowThreshold = 65536;
	            channel.binaryType = "arraybuffer";
	            this.soraDataChannels[channel.label] = channel;
	            this.trace("OPEN DATA CHANNEL", channel.label);
	            if (channel.label === "signaling" && this.ws) {
	                this.writeDataChannelSignalingLog("onopen", channel);
	            }
	            else {
	                this.writeDataChannelTimelineLog("onopen", channel);
	            }
	        };
	        // onclose
	        dataChannelEvent.channel.onclose = async (event) => {
	            const channel = event.currentTarget;
	            this.writeDataChannelTimelineLog("onclose", channel);
	            this.trace("CLOSE DATA CHANNEL", channel.label);
	            await this.disconnect();
	        };
	        // onerror
	        dataChannelEvent.channel.onerror = async (event) => {
	            const channel = event.currentTarget;
	            this.writeDataChannelTimelineLog("onerror", channel);
	            this.trace("ERROR DATA CHANNEL", channel.label);
	            await this.abend("DATA-CHANNEL-ONERROR", { params: { label: channel.label } });
	        };
	        // onmessage
	        if (dataChannelEvent.channel.label === "signaling") {
	            dataChannelEvent.channel.onmessage = async (event) => {
	                const channel = event.currentTarget;
	                let data = event.data;
	                if (this.signalingOfferMessageDataChannels.signaling &&
	                    this.signalingOfferMessageDataChannels.signaling.compress === true) {
	                    const unzlibMessage = unzlibSync(new Uint8Array(event.data));
	                    data = new TextDecoder().decode(unzlibMessage);
	                }
	                const message = JSON.parse(data);
	                this.writeDataChannelSignalingLog(`onmessage-${message.type}`, channel, message);
	                if (message.type === "re-offer") {
	                    await this.signalingOnMessageTypeReOffer(message);
	                }
	            };
	        }
	        else if (dataChannelEvent.channel.label === "notify") {
	            dataChannelEvent.channel.onmessage = (event) => {
	                const channel = event.currentTarget;
	                let data = event.data;
	                if (this.signalingOfferMessageDataChannels.notify &&
	                    this.signalingOfferMessageDataChannels.notify.compress === true) {
	                    const unzlibMessage = unzlibSync(new Uint8Array(event.data));
	                    data = new TextDecoder().decode(unzlibMessage);
	                }
	                const message = JSON.parse(data);
	                if (message.event_type === "connection.created") {
	                    this.writeDataChannelTimelineLog("notify-connection.created", channel, message);
	                }
	                else if (message.event_type === "connection.destroyed") {
	                    this.writeDataChannelTimelineLog("notify-connection.destroyed", channel, message);
	                }
	                this.signalingOnMessageTypeNotify(message, "datachannel");
	            };
	        }
	        else if (dataChannelEvent.channel.label === "push") {
	            dataChannelEvent.channel.onmessage = (event) => {
	                let data = event.data;
	                if (this.signalingOfferMessageDataChannels.push &&
	                    this.signalingOfferMessageDataChannels.push.compress === true) {
	                    const unzlibMessage = unzlibSync(new Uint8Array(event.data));
	                    data = new TextDecoder().decode(unzlibMessage);
	                }
	                const message = JSON.parse(data);
	                this.callbacks.push(message, "datachannel");
	            };
	        }
	        else if (dataChannelEvent.channel.label === "e2ee") {
	            dataChannelEvent.channel.onmessage = (event) => {
	                const channel = event.currentTarget;
	                const data = event.data;
	                this.signalingOnMessageE2EE(data);
	                this.writeDataChannelSignalingLog("onmessage-e2ee", channel, data);
	            };
	        }
	        else if (dataChannelEvent.channel.label === "stats") {
	            dataChannelEvent.channel.onmessage = async (event) => {
	                let data = event.data;
	                if (this.signalingOfferMessageDataChannels.stats &&
	                    this.signalingOfferMessageDataChannels.stats.compress === true) {
	                    const unzlibMessage = unzlibSync(new Uint8Array(event.data));
	                    data = new TextDecoder().decode(unzlibMessage);
	                }
	                const message = JSON.parse(data);
	                if (message.type === "req-stats") {
	                    const stats = await this.getStats();
	                    this.sendStatsMessage(stats);
	                }
	            };
	        }
	        else if (/^#.*/.exec(dataChannelEvent.channel.label)) {
	            dataChannelEvent.channel.onmessage = (event) => {
	                if (event.target === null) {
	                    return;
	                }
	                const dataChannel = event.target;
	                let data = event.data;
	                const settings = this.signalingOfferMessageDataChannels[dataChannel.label];
	                if (settings !== undefined && settings.compress === true) {
	                    data = unzlibSync(new Uint8Array(event.data)).buffer;
	                }
	                this.callbacks.message(createDataChannelMessageEvent(dataChannel.label, data));
	            };
	        }
	    }
	    /**
	     * シグナリングサーバーへメッセージを送信するメソッド
	     *
	     * @param message - 送信するメッセージ
	     */
	    sendSignalingMessage(message) {
	        if (this.soraDataChannels.signaling) {
	            if (this.signalingOfferMessageDataChannels.signaling &&
	                this.signalingOfferMessageDataChannels.signaling.compress === true) {
	                const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
	                const zlibMessage = zlibSync(binaryMessage, {});
	                this.soraDataChannels.signaling.send(zlibMessage);
	            }
	            else {
	                this.soraDataChannels.signaling.send(JSON.stringify(message));
	            }
	            this.writeDataChannelSignalingLog(`send-${message.type}`, this.soraDataChannels.signaling, message);
	        }
	        else if (this.ws !== null) {
	            this.ws.send(JSON.stringify(message));
	            this.writeWebSocketSignalingLog(`send-${message.type}`, message);
	        }
	    }
	    /**
	     * シグナリングサーバーに E2E 用メッセージを投げるメソッド
	     *
	     * @param message - 送信するバイナリメッセージ
	     */
	    sendE2EEMessage(message) {
	        if (this.soraDataChannels.e2ee) {
	            this.soraDataChannels.e2ee.send(message);
	            this.writeDataChannelSignalingLog("send-e2ee", this.soraDataChannels.e2ee, message);
	        }
	        else if (this.ws !== null) {
	            this.ws.send(message);
	            this.writeWebSocketSignalingLog("send-e2ee", message);
	        }
	    }
	    /**
	     * シグナリングサーバーに stats メッセージを投げるメソッド
	     *
	     * @param reports - RTCStatsReport のリスト
	     */
	    sendStatsMessage(reports) {
	        if (this.soraDataChannels.stats) {
	            const message = {
	                type: "stats",
	                reports: reports,
	            };
	            if (this.signalingOfferMessageDataChannels.stats &&
	                this.signalingOfferMessageDataChannels.stats.compress === true) {
	                const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
	                const zlibMessage = zlibSync(binaryMessage, {});
	                this.soraDataChannels.stats.send(zlibMessage);
	            }
	            else {
	                this.soraDataChannels.stats.send(JSON.stringify(message));
	            }
	        }
	    }
	    /**
	     * audio transceiver を取得するメソッド
	     */
	    getAudioTransceiver() {
	        if (this.pc && this.mids.audio) {
	            const transceiver = this.pc.getTransceivers().find((transceiver) => {
	                return transceiver.mid === this.mids.audio;
	            });
	            return transceiver || null;
	        }
	        return null;
	    }
	    /**
	     * video transceiver を取得するメソッド
	     */
	    getVideoTransceiver() {
	        if (this.pc && this.mids.video) {
	            const transceiver = this.pc.getTransceivers().find((transceiver) => {
	                return transceiver.mid === this.mids.video;
	            });
	            return transceiver || null;
	        }
	        return null;
	    }
	    /**
	     * disconnect callback に渡す Event オブジェクトを生成するためのメソッド
	     *
	     * @param type - Event タイプ(normal | abend)
	     * @param title - Event タイトル
	     * @param initDict - Event に設定するオプションパラメーター
	     */
	    soraCloseEvent(type, title, initDict) {
	        const soraCloseEvent = class SoraCloseEvent extends Event {
	            constructor(type, title, initDict) {
	                super(type);
	                if (initDict) {
	                    if (initDict.code) {
	                        this.code = initDict.code;
	                    }
	                    if (initDict.reason) {
	                        this.reason = initDict.reason;
	                    }
	                    if (initDict.params) {
	                        this.params = initDict.params;
	                    }
	                }
	                this.title = title;
	            }
	        };
	        return new soraCloseEvent(type, title, initDict);
	    }
	    /**
	     * DataChannel を使用してメッセージを送信するメソッド
	     *
	     * @param label - メッセージを送信する DataChannel のラベル
	     * @param message - Uint8Array
	     */
	    sendMessage(label, message) {
	        const dataChannel = this.soraDataChannels[label];
	        // 接続していない場合は何もしない
	        if (this.pc === null) {
	            return;
	        }
	        if (dataChannel === undefined) {
	            throw new Error("Could not find DataChannel");
	        }
	        const settings = this.signalingOfferMessageDataChannels[label];
	        if (settings !== undefined && settings.compress === true) {
	            const zlibMessage = zlibSync(message, {});
	            dataChannel.send(zlibMessage);
	        }
	        else {
	            dataChannel.send(message);
	        }
	    }
	    /**
	     * E2EE の自分のフィンガープリント
	     */
	    get e2eeSelfFingerprint() {
	        if (this.options.e2ee && this.e2ee) {
	            return this.e2ee.selfFingerprint();
	        }
	        return;
	    }
	    /**
	     * E2EE のリモートのフィンガープリントリスト
	     */
	    get e2eeRemoteFingerprints() {
	        if (this.options.e2ee && this.e2ee) {
	            return this.e2ee.remoteFingerprints();
	        }
	        return;
	    }
	    /**
	     * audio が有効かどうか
	     */
	    get audio() {
	        return this.getAudioTransceiver() !== null;
	    }
	    /**
	     * video が有効かどうか
	     */
	    get video() {
	        return this.getVideoTransceiver() !== null;
	    }
	    /**
	     * シグナリングに使用する URL
	     *
	     * @deprecated
	     */
	    get signalingUrl() {
	        return this.signalingUrlCandidates;
	    }
	    /**
	     * 接続中のシグナリング URL
	     */
	    get connectedSignalingUrl() {
	        if (!this.ws) {
	            return "";
	        }
	        return this.ws.url;
	    }
	    /**
	     * DataChannel メッセージング用の DataChannel 情報のリスト
	     */
	    get datachannels() {
	        if (!this.signalingSwitched) {
	            return [];
	        }
	        const messagingDataChannellabels = Object.keys(this.signalingOfferMessageDataChannels).filter((label) => {
	            return /^#.*/.exec(label);
	        });
	        const result = [];
	        for (const label of messagingDataChannellabels) {
	            const dataChannel = this.soraDataChannels[label];
	            if (!dataChannel) {
	                continue;
	            }
	            const settings = this.signalingOfferMessageDataChannels[label];
	            if (!settings) {
	                continue;
	            }
	            const messagingDataChannel = {
	                label: dataChannel.label,
	                ordered: dataChannel.ordered,
	                protocol: dataChannel.protocol,
	                compress: settings.compress,
	                direction: settings.direction,
	            };
	            if (typeof dataChannel.maxPacketLifeTime === "number") {
	                messagingDataChannel.maxPacketLifeTime = dataChannel.maxPacketLifeTime;
	            }
	            if (typeof dataChannel.maxRetransmits === "number") {
	                messagingDataChannel.maxRetransmits = dataChannel.maxRetransmits;
	            }
	            result.push(messagingDataChannel);
	        }
	        return result;
	    }
	}

	/**
	 * Role が "sendonly" または "sendrecv" の場合に Sora との WebRTC 接続を扱うクラス
	 */
	class ConnectionPublisher extends ConnectionBase {
	    /**
	     * Sora へ接続するメソッド
	     *
	     * @example
	     * ```typescript
	     * const sendrecv = connection.sendrecv("sora");
	     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
	     * await sendrecv.connect(mediaStream);
	     * ```
	     *
	     * @param stream - メディアストリーム
	     *
	     * @public
	     */
	    async connect(stream) {
	        if (this.options.multistream) {
	            await Promise.race([
	                this.multiStream(stream).finally(() => {
	                    this.clearConnectionTimeout();
	                    this.clearMonitorSignalingWebSocketEvent();
	                }),
	                this.setConnectionTimeout(),
	                this.monitorSignalingWebSocketEvent(),
	            ]);
	        }
	        else {
	            await Promise.race([
	                this.singleStream(stream).finally(() => {
	                    this.clearConnectionTimeout();
	                    this.clearMonitorSignalingWebSocketEvent();
	                }),
	                this.setConnectionTimeout(),
	                this.monitorSignalingWebSocketEvent(),
	            ]);
	        }
	        this.monitorWebSocketEvent();
	        this.monitorPeerConnectionState();
	        return stream;
	    }
	    /**
	     * シングルストリームで Sora へ接続するメソッド
	     *
	     * @param stream - メディアストリーム
	     */
	    async singleStream(stream) {
	        await this.disconnect();
	        this.setupE2EE();
	        const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
	        const signalingMessage = await this.signaling(ws);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        await this.setRemoteDescription(signalingMessage);
	        stream.getTracks().forEach((track) => {
	            if (this.pc) {
	                this.pc.addTrack(track, stream);
	            }
	        });
	        this.stream = stream;
	        await this.createAnswer(signalingMessage);
	        this.sendAnswer();
	        if (this.pc && this.e2ee) {
	            this.pc.getSenders().forEach((sender) => {
	                if (this.e2ee) {
	                    this.e2ee.setupSenderTransform(sender);
	                }
	            });
	        }
	        await this.onIceCandidate();
	        await this.waitChangeConnectionStateConnected();
	        return stream;
	    }
	    /**
	     * マルチストリームで Sora へ接続するメソッド
	     *
	     * @param stream - メディアストリーム
	     */
	    async multiStream(stream) {
	        await this.disconnect();
	        this.setupE2EE();
	        const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
	        const signalingMessage = await this.signaling(ws);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = (event) => {
	                const stream = event.streams[0];
	                if (!stream) {
	                    return;
	                }
	                const data = {
	                    "stream.id": stream.id,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog("ontrack", data);
	                if (stream.id === "default") {
	                    return;
	                }
	                if (stream.id === this.connectionId) {
	                    return;
	                }
	                if (this.e2ee) {
	                    this.e2ee.setupReceiverTransform(event.receiver);
	                }
	                this.callbacks.track(event);
	                stream.onremovetrack = (event) => {
	                    this.callbacks.removetrack(event);
	                    if (event.target) {
	                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                        const index = this.remoteConnectionIds.indexOf(event.target.id);
	                        if (-1 < index) {
	                            delete this.remoteConnectionIds[index];
	                            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                            event.stream = event.target;
	                            this.callbacks.removestream(event);
	                        }
	                    }
	                };
	                if (-1 < this.remoteConnectionIds.indexOf(stream.id)) {
	                    return;
	                }
	                // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
	                event.stream = stream;
	                this.remoteConnectionIds.push(stream.id);
	                this.callbacks.addstream(event);
	            };
	        }
	        await this.setRemoteDescription(signalingMessage);
	        stream.getTracks().forEach((track) => {
	            if (this.pc) {
	                this.pc.addTrack(track, stream);
	            }
	        });
	        this.stream = stream;
	        await this.createAnswer(signalingMessage);
	        this.sendAnswer();
	        if (this.pc && this.e2ee) {
	            this.pc.getSenders().forEach((sender) => {
	                if (this.e2ee) {
	                    this.e2ee.setupSenderTransform(sender);
	                }
	            });
	        }
	        await this.onIceCandidate();
	        await this.waitChangeConnectionStateConnected();
	        return stream;
	    }
	}

	/**
	 * Role が "recvonly" の場合に Sora との WebRTC 接続を扱うクラス
	 */
	class ConnectionSubscriber extends ConnectionBase {
	    /**
	     * Sora へ接続するメソッド
	     *
	     * @example
	     * ```typescript
	     * const recvonly = connection.sendrecv("sora");
	     * await recvonly.connect();
	     * ```
	     *
	     * @param stream - メディアストリーム
	     *
	     * @public
	     */
	    async connect() {
	        if (this.options.multistream) {
	            await Promise.race([
	                this.multiStream().finally(() => {
	                    this.clearConnectionTimeout();
	                    this.clearMonitorSignalingWebSocketEvent();
	                }),
	                this.setConnectionTimeout(),
	                this.monitorSignalingWebSocketEvent(),
	            ]);
	            this.monitorWebSocketEvent();
	            this.monitorPeerConnectionState();
	            return;
	        }
	        else {
	            const stream = await Promise.race([
	                this.singleStream().finally(() => {
	                    this.clearConnectionTimeout();
	                    this.clearMonitorSignalingWebSocketEvent();
	                }),
	                this.setConnectionTimeout(),
	                this.monitorSignalingWebSocketEvent(),
	            ]);
	            this.monitorWebSocketEvent();
	            this.monitorPeerConnectionState();
	            return stream;
	        }
	    }
	    /**
	     * シングルストリームで Sora へ接続するメソッド
	     *
	     * @param stream - メディアストリーム
	     */
	    async singleStream() {
	        await this.disconnect();
	        this.setupE2EE();
	        const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
	        const signalingMessage = await this.signaling(ws);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = (event) => {
	                this.stream = event.streams[0];
	                const streamId = this.stream.id;
	                if (streamId === "default") {
	                    return;
	                }
	                const data = {
	                    "stream.id": streamId,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog("ontrack", data);
	                if (this.e2ee) {
	                    this.e2ee.setupReceiverTransform(event.receiver);
	                }
	                this.callbacks.track(event);
	                this.stream.onremovetrack = (event) => {
	                    this.callbacks.removetrack(event);
	                    if (event.target) {
	                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                        const index = this.remoteConnectionIds.indexOf(event.target.id);
	                        if (-1 < index) {
	                            delete this.remoteConnectionIds[index];
	                            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                            event.stream = event.target;
	                            this.callbacks.removestream(event);
	                        }
	                    }
	                };
	                if (-1 < this.remoteConnectionIds.indexOf(streamId)) {
	                    return;
	                }
	                // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
	                event.stream = this.stream;
	                this.remoteConnectionIds.push(streamId);
	                this.callbacks.addstream(event);
	            };
	        }
	        await this.setRemoteDescription(signalingMessage);
	        await this.createAnswer(signalingMessage);
	        this.sendAnswer();
	        await this.onIceCandidate();
	        await this.waitChangeConnectionStateConnected();
	        return this.stream || new MediaStream();
	    }
	    /**
	     * マルチストリームで Sora へ接続するメソッド
	     *
	     * @param stream - メディアストリーム
	     */
	    async multiStream() {
	        await this.disconnect();
	        this.setupE2EE();
	        const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
	        const signalingMessage = await this.signaling(ws);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = (event) => {
	                const stream = event.streams[0];
	                if (stream.id === "default") {
	                    return;
	                }
	                if (stream.id === this.connectionId) {
	                    return;
	                }
	                const data = {
	                    "stream.id": stream.id,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog("ontrack", data);
	                if (this.e2ee) {
	                    this.e2ee.setupReceiverTransform(event.receiver);
	                }
	                this.callbacks.track(event);
	                stream.onremovetrack = (event) => {
	                    this.callbacks.removetrack(event);
	                    if (event.target) {
	                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                        const index = this.remoteConnectionIds.indexOf(event.target.id);
	                        if (-1 < index) {
	                            delete this.remoteConnectionIds[index];
	                            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                            event.stream = event.target;
	                            this.callbacks.removestream(event);
	                        }
	                    }
	                };
	                if (-1 < this.remoteConnectionIds.indexOf(stream.id)) {
	                    return;
	                }
	                // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
	                event.stream = stream;
	                this.remoteConnectionIds.push(stream.id);
	                this.callbacks.addstream(event);
	            };
	        }
	        await this.setRemoteDescription(signalingMessage);
	        await this.createAnswer(signalingMessage);
	        this.sendAnswer();
	        await this.onIceCandidate();
	        await this.waitChangeConnectionStateConnected();
	        return;
	    }
	}

	/**
	 *  MediaStream の constraints を動的に変更するメソッド.
	 *
	 * @param mediastream - メディアストリーム
	 *
	 * @param constraints - メディアストリーム制約
	 *
	 * @public
	 */
	async function applyMediaStreamConstraints(mediastream, constraints) {
	    if (constraints.audio && typeof constraints.audio !== "boolean") {
	        for (const track of mediastream.getAudioTracks()) {
	            await track.applyConstraints(constraints.audio);
	        }
	    }
	    if (constraints.video && typeof constraints.video !== "boolean") {
	        for (const track of mediastream.getVideoTracks()) {
	            await track.applyConstraints(constraints.video);
	        }
	    }
	}

	/**
	 * Role 毎の Connection インスタンスを生成するためのクラス
	 *
	 * @param signalingUrlCandidates - シグナリングに使用する URL の候補
	 * @param debug - デバッグフラグ
	 */
	class SoraConnection {
	    constructor(signalingUrlCandidates, debug = false) {
	        this.signalingUrlCandidates = signalingUrlCandidates;
	        this.debug = debug;
	    }
	    /**
	     * role sendrecv で接続するための Connecion インスタンスを生成するメソッド
	     *
	     * @example
	     * ```typescript
	     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
	     * const sendrecv = connection.sendrecv("sora");
	     * ```
	     *
	     * @param channelId - チャネルID
	     * @param metadata - メタデータ
	     * @param options - コネクションオプション
	     *
	     * @returns
	     * role sendrecv な Connection オブジェクトを返します
	     *
	     * @public
	     */
	    sendrecv(channelId, metadata = null, options = { audio: true, video: true }) {
	        return new ConnectionPublisher(this.signalingUrlCandidates, "sendrecv", channelId, metadata, options, this.debug);
	    }
	    /**
	     * role sendonly で接続するための Connecion インスタンスを生成するメソッド
	     *
	     * @param channelId - チャネルID
	     * @param metadata - メタデータ
	     * @param options - コネクションオプション
	     *
	     * @example
	     * ```typescript
	     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
	     * const sendonly = connection.sendonly("sora");
	     * ```
	     *
	     * @returns
	     * role sendonly な Connection オブジェクトを返します
	     *
	     * @public
	     */
	    sendonly(channelId, metadata = null, options = { audio: true, video: true }) {
	        return new ConnectionPublisher(this.signalingUrlCandidates, "sendonly", channelId, metadata, options, this.debug);
	    }
	    /**
	     * role recvonly で接続するための Connecion インスタンスを生成するメソッド
	     *
	     * @example
	     * ```typescript
	     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
	     * const recvonly = connection.recvonly("sora");
	     * ```
	     *
	     * @param channelId - チャネルID
	     * @param metadata - メタデータ
	     * @param options - コネクションオプション
	     *
	     * @returns
	     * role recvonly な Connection オブジェクトを返します
	     *
	     * @public
	     */
	    recvonly(channelId, metadata = null, options = { audio: true, video: true }) {
	        return new ConnectionSubscriber(this.signalingUrlCandidates, "recvonly", channelId, metadata, options, this.debug);
	    }
	    /**
	     * シグナリングに使用する URL の候補
	     *
	     * @public
	     * @deprecated
	     */
	    get signalingUrl() {
	        return this.signalingUrlCandidates;
	    }
	}
	/**
	 * Sora JS SDK package
	 */
	var sora = {
	    /**
	     * E2EE で使用する WASM の読み込みを行うメソッド
	     *
	     * @example
	     * ```typescript
	     * Sora.initE2EE("http://192.0.2.100/wasm.wasm");
	     * ```
	     * @param wasmUrl - E2EE WASM の URL
	     *
	     * @public
	     */
	    initE2EE: async function (wasmUrl) {
	        await SoraE2EE.loadWasm(wasmUrl);
	    },
	    /**
	     * SoraConnection インスタンスを生成するメソッド
	     *
	     * @example
	     * ```typescript
	     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
	     * ```
	     *
	     * @param signalingUrlCandidates - シグナリングに使用する URL 候補
	     * @param debug - デバッグフラグ
	     *
	     * @public
	     *
	     */
	    connection: function (signalingUrlCandidates, debug = false) {
	        return new SoraConnection(signalingUrlCandidates, debug);
	    },
	    /**
	     * SDK のバージョンを返すメソッド
	     *
	     * @public
	     */
	    version: function () {
	        return "2021.2.0";
	    },
	    /**
	     * WebRTC のユーティリティ関数群
	     *
	     * @public
	     */
	    helpers: {
	        applyMediaStreamConstraints,
	    },
	};

	return sora;

}));
