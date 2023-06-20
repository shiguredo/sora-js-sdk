/**
 * sora-js-sdk
 * WebRTC SFU Sora JavaScript SDK
 * @version: 2023.1.0
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Sora = factory());
})(this, (function () { 'use strict';

	/**
	 * @sora/e2ee
	 * WebRTC SFU Sora JavaScript E2EE Library
	 * @version: 2021.1.0
	 * @author: Shiguredo Inc.
	 * @license: Apache-2.0
	 **/

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

	const WORKER_SCRIPT = 'InVzZSBzdHJpY3QiOwovKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnMgKi8KY29uc3QgY29ubmVjdGlvbklkTGVuZ3RoID0gMjY7CmZ1bmN0aW9uIGJ5dGVDb3VudChuKSB7CiAgICBpZiAobiA9PSAwKSB7CiAgICAgICAgcmV0dXJuIDE7CiAgICB9CiAgICAvLyBsb2cyNTYoeCkgPSBsb2coeCkgLyBsb2coMjU2KQogICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5sb2cobikgLyBNYXRoLmxvZygyICoqIDgpICsgMSk7Cn0KZnVuY3Rpb24gYXJyYXlCdWZmZXJUb051bWJlcihhcnJheUJ1ZmZlcikgewogICAgLy8gMzJiaXQg44G+44Gn44KS5oOz5a6aIChCaWdJbnQg44G444Gu5pu444GN5o+b44GI5pmC44Gr6KaB5L+u5q2jKQogICAgY29uc3QgbmV3QXJyYXlCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQpOwogICAgY29uc3QgbmV3RGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcobmV3QXJyYXlCdWZmZXIpOwogICAgY29uc3QgZGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoYXJyYXlCdWZmZXIpOwogICAgY29uc3QgcGFkZGluZ0xlbmd0aCA9IFVpbnQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UIC0gZGF0YVZpZXcuYnl0ZUxlbmd0aDsKICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFkZGluZ0xlbmd0aDsgaSArPSAxKSB7CiAgICAgICAgbmV3RGF0YVZpZXcuc2V0VWludDgoaSwgMCk7CiAgICB9CiAgICBmb3IgKGxldCBpID0gcGFkZGluZ0xlbmd0aCwgaiA9IDA7IGkgPCBVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDsgaSArPSAxLCBqICs9IDEpIHsKICAgICAgICBuZXdEYXRhVmlldy5zZXRVaW50OChpLCBkYXRhVmlldy5nZXRVaW50OChqKSk7CiAgICB9CiAgICByZXR1cm4gbmV3RGF0YVZpZXcuZ2V0VWludDMyKDApOwp9CmZ1bmN0aW9uIGVuY29kZVNGcmFtZUhlYWRlcihzLCBjb3VudCwga2V5SWQpIHsKICAgIC8vICAwIDEgMiAzIDQgNSA2IDcKICAgIC8vICstKy0rLSstKy0rLSstKy0rLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSsKICAgIC8vIHxTfExFTiAgfDF8S0xFTiB8ICAgS0lELi4uIChsZW5ndGg9S0xFTikgICAgfCAgICBDVFIuLi4gKGxlbmd0aD1MRU4pICAgIHwKICAgIC8vICstKy0rLSstKy0rLSstKy0rLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSsKICAgIC8vIFM6IDEgYml0CiAgICAvLyBMRU46IDMgYml0CiAgICAvLyBYOiAxIGJpdAogICAgLy8gS0xFTjogMyBiaXQKICAgIC8vIEtJRDogS0xFTiBieXRlCiAgICAvLyBDVFI6IExFTiBieXRlCiAgICAvLyBUT0RPOiBrZXlJZCAoS0lEKSDjgYwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIDcgYnl0ZSDjgpLotoXjgYjjgabjgYTjgZ/loLTlkIjjga/jgqjjg6njg7zjgYvkvovlpJYKICAgIC8vIFRPRE86IGNvdW50IChDVFIpIOOBjCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgNyBieXRlIOOCkui2heOBiOOBpuOBhOOBn+WgtOWQiOOBr+OCqOODqeODvOOBi+S+i+WklgogICAgaWYgKG1heEtleUlkIDwga2V5SWQgfHwgbWF4Q291bnQgPCBjb3VudCkgewogICAgICAgIHRocm93IG5ldyBFcnJvcignRVhDRUVERUQtTUFYSU1VTS1CUk9BRENBU1RJTkctVElNRScpOwogICAgfQogICAgY29uc3Qga2xlbiA9IGJ5dGVDb3VudChrZXlJZCk7CiAgICBjb25zdCBsZW4gPSBieXRlQ291bnQoY291bnQpOwogICAgY29uc3QgaGVhZGVyQnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDEgKyBrbGVuICsgbGVuKTsKICAgIGNvbnN0IGhlYWRlckRhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGhlYWRlckJ1ZmZlcik7CiAgICAvLyBTLCBMRU4sIDEsIEtMRU4g44GnIDEgYnl0ZQogICAgaGVhZGVyRGF0YVZpZXcuc2V0VWludDgoMCwgKHMgPDwgNykgKyAobGVuIDw8IDQpICsgKDEgPDwgMykgKyBrbGVuKTsKICAgIGNvbnN0IGhlYWRlclVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShoZWFkZXJCdWZmZXIpOwogICAgY29uc3Qga2V5SWRCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQpOwogICAgY29uc3Qga2V5SWREYXRhVmlldyA9IG5ldyBEYXRhVmlldyhrZXlJZEJ1ZmZlcik7CiAgICBrZXlJZERhdGFWaWV3LnNldFVpbnQzMigwLCBrZXlJZCk7CiAgICBjb25zdCBrZXlJZFVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShrZXlJZEJ1ZmZlcik7CiAgICBoZWFkZXJVaW50OEFycmF5LnNldChrZXlJZFVpbnQ4QXJyYXkuc3ViYXJyYXkoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQgLSBrbGVuKSwgMSk7CiAgICBjb25zdCBjb3VudEJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCk7CiAgICBjb25zdCBjb3VudERhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGNvdW50QnVmZmVyKTsKICAgIGNvdW50RGF0YVZpZXcuc2V0VWludDMyKDAsIGNvdW50KTsKICAgIGNvbnN0IGNvdW50VWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGNvdW50QnVmZmVyKTsKICAgIGhlYWRlclVpbnQ4QXJyYXkuc2V0KGNvdW50VWludDhBcnJheS5zdWJhcnJheShVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCAtIGxlbiksIGtsZW4gKyAxKTsKICAgIHJldHVybiBoZWFkZXJVaW50OEFycmF5Owp9CmZ1bmN0aW9uIHNwbGl0SGVhZGVyKHNmcmFtZSkgewogICAgY29uc3Qgc2ZyYW1lRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoc2ZyYW1lKTsKICAgIGNvbnN0IGhlYWRlciA9IHNmcmFtZURhdGFWaWV3LmdldFVpbnQ4KDApOwogICAgY29uc3QgbGVuID0gKGhlYWRlciAmIDB4NzApID4+IDQ7CiAgICBjb25zdCBrbGVuID0gaGVhZGVyICYgMHgwNzsKICAgIGNvbnN0IHNmcmFtZUhlYWRlckxlbmd0aCA9IDEgKyBrbGVuICsgbGVuOwogICAgY29uc3Qgc2ZyYW1lSGVhZGVyID0gc2ZyYW1lLnNsaWNlKDAsIHNmcmFtZUhlYWRlckxlbmd0aCk7CiAgICBpZiAoc2ZyYW1lSGVhZGVyLmJ5dGVMZW5ndGggPCBzZnJhbWVIZWFkZXJMZW5ndGgpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VORVhQRUNURUQtU0ZSQU1FLUxFTkdUSCcpOwogICAgfQogICAgY29uc3QgY29ubmVjdGlvbklkID0gc2ZyYW1lLnNsaWNlKHNmcmFtZUhlYWRlckxlbmd0aCwgc2ZyYW1lSGVhZGVyTGVuZ3RoICsgY29ubmVjdGlvbklkTGVuZ3RoKTsKICAgIGNvbnN0IGVuY3J5cHRlZEZyYW1lID0gc2ZyYW1lLnNsaWNlKHNmcmFtZUhlYWRlckxlbmd0aCArIGNvbm5lY3Rpb25JZExlbmd0aCwgc2ZyYW1lLmJ5dGVMZW5ndGgpOwogICAgcmV0dXJuIFtzZnJhbWVIZWFkZXIsIGNvbm5lY3Rpb25JZCwgZW5jcnlwdGVkRnJhbWVdOwp9CmZ1bmN0aW9uIHBhcnNlU0ZyYW1lSGVhZGVyKHNmcmFtZUhlYWRlcikgewogICAgY29uc3Qgc2ZyYW1lSGVhZGVyRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoc2ZyYW1lSGVhZGVyKTsKICAgIGNvbnN0IGhlYWRlciA9IHNmcmFtZUhlYWRlckRhdGFWaWV3LmdldFVpbnQ4KDApOwogICAgY29uc3QgcyA9IChoZWFkZXIgJiAweDgwKSA+PiA3OwogICAgY29uc3QgbGVuID0gKGhlYWRlciAmIDB4NzApID4+IDQ7CiAgICBjb25zdCB4ID0gKGhlYWRlciAmIDB4MDgpID4+IDM7CiAgICBjb25zdCBrbGVuID0gaGVhZGVyICYgMHgwNzsKICAgIC8vIHggZmxhZwogICAgaWYgKHggIT09IDEpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VORVhQRUNURUQtWC1GTEFHJyk7CiAgICB9CiAgICBjb25zdCBoZWFkZXJMZW5ndGggPSAxICsga2xlbiArIGxlbjsKICAgIGlmIChzZnJhbWVIZWFkZXJEYXRhVmlldy5ieXRlTGVuZ3RoIDwgaGVhZGVyTGVuZ3RoKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVTkVYUEVDVEVELVNGUkFNRS1IRUFERVItTEVOR1RIJyk7CiAgICB9CiAgICBjb25zdCBrZXlJZEJ1ZmZlciA9IHNmcmFtZUhlYWRlci5zbGljZSgxLCAxICsga2xlbik7CiAgICBjb25zdCBrZXlJZCA9IGFycmF5QnVmZmVyVG9OdW1iZXIoa2V5SWRCdWZmZXIpOwogICAgY29uc3QgY291bnRCdWZmZXIgPSBzZnJhbWVIZWFkZXIuc2xpY2UoMSArIGtsZW4sIGhlYWRlckxlbmd0aCk7CiAgICBjb25zdCBjb3VudCA9IGFycmF5QnVmZmVyVG9OdW1iZXIoY291bnRCdWZmZXIpOwogICAgcmV0dXJuIFtzLCBjb3VudCwga2V5SWRdOwp9Ci8qIGVzbGludC1kaXNhYmxlIEB0eXBlc2NyaXB0LWVzbGludC90cmlwbGUtc2xhc2gtcmVmZXJlbmNlLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnMgKi8KLy8vIDxyZWZlcmVuY2UgcGF0aD0iLi9zZnJhbWUudHMiLz4KLy8gVE9ETzog5omx44GG5pWw5YCk44GM5aSn44GN44GE566H5omA44Gn44GvIE51bWJlciDjgYvjgokgQmlnSW50IOOBq+e9ruOBjeaPm+OBiOOCiwovLyBUT0RPOiBCaWdJbnQg44Gr572u44GN5o+b44GI44KL6Zqb44Gr5aSJ5pu044GZ44KLCmNvbnN0IG1heEtleUlkID0gMiAqKiAzMjsKY29uc3QgbWF4Q291bnQgPSAyICoqIDMyOwpjb25zdCBzZWxmRGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwpjb25zdCBjb3VudE1hcCA9IG5ldyBNYXAoKTsKY29uc3Qgd3JpdGVJVk1hcCA9IG5ldyBNYXAoKTsKY29uc3QgcmVtb3RlRGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwpjb25zdCBsYXRlc3RSZW1vdGVLZXlJZE1hcCA9IG5ldyBNYXAoKTsKY29uc3QgbGl0dGxlRW5kaWFuID0gdHJ1ZTsKY29uc3QgYmlnRW5kaWFuID0gIWxpdHRsZUVuZGlhbjsKY29uc3QgdGV4dEVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTsKY29uc3QgdGV4dERlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTsKLy8gVlA4IOOBruOBvwovLyBUT0RPKG5ha2FpKTogVlA5IC8gQVYxIOOCguWwhuadpeeahOOBq+WvvuW/nOOCguiAg+OBiOOCiwpjb25zdCB1bmVuY3J5cHRlZEJ5dGVzID0gewogICAgLy8gSSDjg5Xjg6zjg7zjg6AKICAgIGtleTogMTAsCiAgICAvLyDpnZ4gSSDjg5Xjg6zjg7zjg6AKICAgIGRlbHRhOiAzLAogICAgLy8g44Kq44O844OH44Kj44KqCiAgICB1bmRlZmluZWQ6IDEsCn07CmZ1bmN0aW9uIGdldENvdW50KGNvbm5lY3Rpb25JZCkgewogICAgcmV0dXJuIGNvdW50TWFwLmdldChjb25uZWN0aW9uSWQpIHx8IDA7Cn0KZnVuY3Rpb24gc2V0Q291bnQoY29ubmVjdGlvbklkLCBjb3VudCkgewogICAgcmV0dXJuIGNvdW50TWFwLnNldChjb25uZWN0aW9uSWQsIGNvdW50KTsKfQpmdW5jdGlvbiBnZXRSZW1vdGVEZXJpdmVLZXkoY29ubmVjdGlvbklkLCBrZXlJZCkgewogICAgaWYgKCFyZW1vdGVEZXJpdmVLZXlNYXAuaGFzKGNvbm5lY3Rpb25JZCkpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JFTU9URS1ERVJJVkVLRVktTUFQLU5PVC1GT1VORCcpOwogICAgfQogICAgY29uc3QgZGVyaXZlS2V5TWFwID0gcmVtb3RlRGVyaXZlS2V5TWFwLmdldChjb25uZWN0aW9uSWQpOwogICAgaWYgKCFkZXJpdmVLZXlNYXApIHsKICAgICAgICByZXR1cm47CiAgICB9CiAgICByZXR1cm4gZGVyaXZlS2V5TWFwLmdldChrZXlJZCk7Cn0KZnVuY3Rpb24gc2V0UmVtb3RlRGVyaXZlS2V5KGNvbm5lY3Rpb25JZCwga2V5SWQsIGRlcml2ZUtleSkgewogICAgbGV0IGRlcml2ZUtleU1hcCA9IHJlbW90ZURlcml2ZUtleU1hcC5nZXQoY29ubmVjdGlvbklkKTsKICAgIGlmICghZGVyaXZlS2V5TWFwKSB7CiAgICAgICAgZGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwogICAgfQogICAgZGVyaXZlS2V5TWFwLnNldChrZXlJZCwgZGVyaXZlS2V5KTsKICAgIHJlbW90ZURlcml2ZUtleU1hcC5zZXQoY29ubmVjdGlvbklkLCBkZXJpdmVLZXlNYXApOwp9CmZ1bmN0aW9uIHNldExhdGVzdFJlbW90ZUtleUlkKGNvbm5lY3Rpb25JZCwga2V5SWQpIHsKICAgIGNvbnN0IGxhdGVzdFJlbW90ZUtleUlkID0gbGF0ZXN0UmVtb3RlS2V5SWRNYXAuZ2V0KGNvbm5lY3Rpb25JZCk7CiAgICBpZiAobGF0ZXN0UmVtb3RlS2V5SWQpIHsKICAgICAgICBpZiAobGF0ZXN0UmVtb3RlS2V5SWQgPCBrZXlJZCkgewogICAgICAgICAgICBsYXRlc3RSZW1vdGVLZXlJZE1hcC5zZXQoY29ubmVjdGlvbklkLCBrZXlJZCk7CiAgICAgICAgfQogICAgfQogICAgZWxzZSB7CiAgICAgICAgbGF0ZXN0UmVtb3RlS2V5SWRNYXAuc2V0KGNvbm5lY3Rpb25JZCwga2V5SWQpOwogICAgfQp9CmZ1bmN0aW9uIHJlbW92ZU9sZFJlbW90ZURlcml2ZUtleXMoKSB7CiAgICBsYXRlc3RSZW1vdGVLZXlJZE1hcC5mb3JFYWNoKChsYXRlc3RLZXlJZCwgY29ubmVjdGlvbklkKSA9PiB7CiAgICAgICAgY29uc3QgZGVyaXZlS2V5TWFwID0gcmVtb3RlRGVyaXZlS2V5TWFwLmdldChjb25uZWN0aW9uSWQpOwogICAgICAgIGlmIChkZXJpdmVLZXlNYXApIHsKICAgICAgICAgICAgZGVyaXZlS2V5TWFwLmZvckVhY2goKF8sIGtleUlkKSA9PiB7CiAgICAgICAgICAgICAgICBpZiAobGF0ZXN0S2V5SWQgIT09IGtleUlkKSB7CiAgICAgICAgICAgICAgICAgICAgZGVyaXZlS2V5TWFwLmRlbGV0ZShrZXlJZCk7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0pOwogICAgICAgIH0KICAgIH0pOwp9CmZ1bmN0aW9uIHJlbW92ZURlcml2ZUtleShjb25uZWN0aW9uSWQpIHsKICAgIGxhdGVzdFJlbW90ZUtleUlkTWFwLmRlbGV0ZShjb25uZWN0aW9uSWQpOwogICAgcmVtb3RlRGVyaXZlS2V5TWFwLmRlbGV0ZShjb25uZWN0aW9uSWQpOwp9CmZ1bmN0aW9uIGdldExhdGVzdFNlbGZEZXJpdmVLZXkoKSB7CiAgICBjb25zdCBkZXJpdmVLZXkgPSBzZWxmRGVyaXZlS2V5TWFwLmdldCgnbGF0ZXN0Jyk7CiAgICBpZiAoIWRlcml2ZUtleSkgewogICAgICAgIHRocm93IG5ldyBFcnJvcignTEFURVNULVNFTEYtREVSSVZFS0VZLU5PVF9GT1VORCcpOwogICAgfQogICAgcmV0dXJuIGRlcml2ZUtleTsKfQpmdW5jdGlvbiBzZXRTZWxmRGVyaXZlS2V5KGNvbm5lY3Rpb25JZCwga2V5SWQsIGRlcml2ZUtleSkgewogICAgY29uc3QgY3VycmVudFNlbGZEZXJpdmVLZXkgPSBzZWxmRGVyaXZlS2V5TWFwLmdldCgnbGF0ZXN0Jyk7CiAgICBpZiAoY3VycmVudFNlbGZEZXJpdmVLZXkpIHsKICAgICAgICBpZiAoY3VycmVudFNlbGZEZXJpdmVLZXlbJ2tleUlkJ10gPCBrZXlJZCkgewogICAgICAgICAgICBjb25zdCBuZXh0U2VsZkRlcml2ZUtleSA9IHsgY29ubmVjdGlvbklkLCBrZXlJZCwgZGVyaXZlS2V5IH07CiAgICAgICAgICAgIHNlbGZEZXJpdmVLZXlNYXAuc2V0KCdsYXRlc3QnLCBuZXh0U2VsZkRlcml2ZUtleSk7CiAgICAgICAgfQogICAgfQogICAgZWxzZSB7CiAgICAgICAgY29uc3QgbmV4dFNlbGZEZXJpdmVLZXkgPSB7IGNvbm5lY3Rpb25JZCwga2V5SWQsIGRlcml2ZUtleSB9OwogICAgICAgIHNlbGZEZXJpdmVLZXlNYXAuc2V0KCdsYXRlc3QnLCBuZXh0U2VsZkRlcml2ZUtleSk7CiAgICB9Cn0KZnVuY3Rpb24gc2lsZW5jZUZyYW1lKGVuY29kZWRGcmFtZSkgewogICAgLy8gY29ubmVjdGlvbi5jcmVhdGVkLCByZWNlaXZlTWVzc2FnZSDlj5fkv6HliY3jga7loLTlkIgKICAgIGlmIChlbmNvZGVkRnJhbWUudHlwZSA9PT0gdW5kZWZpbmVkKSB7CiAgICAgICAgLy8g6Z+z5aOw44Gv5pqX5Y+35YyW44Gv44GE44KL44Go6IGe44GR44Gf44KC44Gu44GY44KD44Gq44GE44Gu44Gn572u44GN5o+b44GI44KLCiAgICAgICAgY29uc3QgbmV3RGF0YSA9IG5ldyBBcnJheUJ1ZmZlcigzKTsKICAgICAgICBjb25zdCBuZXdVaW50OCA9IG5ldyBVaW50OEFycmF5KG5ld0RhdGEpOwogICAgICAgIC8vIE9wdXMg44K144Kk44Os44Oz44K544OV44Os44O844OgCiAgICAgICAgbmV3VWludDguc2V0KFsweGQ4LCAweGZmLCAweGZlXSk7CiAgICAgICAgZW5jb2RlZEZyYW1lLmRhdGEgPSBuZXdEYXRhOwogICAgfQogICAgZWxzZSB7CiAgICAgICAgLy8g5pig5YOP44GM5q2j5bi444GY44KD44Gq44GE44Gf44KBIFBMSSDjgrnjg4jjg7zjg6DjgYznmbrnlJ/jgZfjgabjgZfjgb7jgYYKICAgICAgICAvLyDjgZ3jga7jgZ/jgoEgMzIweDI0MCDjga7nnJ/jgaPpu5LjgarnlLvpnaLjgavnva7jgY3mj5vjgYjjgosKICAgICAgICBjb25zdCBuZXdEYXRhID0gbmV3IEFycmF5QnVmZmVyKDYwKTsKICAgICAgICBjb25zdCBuZXdVaW50OCA9IG5ldyBVaW50OEFycmF5KG5ld0RhdGEpOwogICAgICAgIC8vIHByZXR0aWVyLWlnbm9yZQogICAgICAgIG5ld1VpbnQ4LnNldChbMHhiMCwgMHgwNSwgMHgwMCwgMHg5ZCwgMHgwMSwgMHgyYSwgMHhhMCwgMHgwMCwgMHg1YSwgMHgwMCwKICAgICAgICAgICAgMHgzOSwgMHgwMywgMHgwMCwgMHgwMCwgMHgxYywgMHgyMiwgMHgxNiwgMHgxNiwgMHgyMiwgMHg2NiwKICAgICAgICAgICAgMHgxMiwgMHgyMCwgMHgwNCwgMHg5MCwgMHg0MCwgMHgwMCwgMHhjNSwgMHgwMSwgMHhlMCwgMHg3YywKICAgICAgICAgICAgMHg0ZCwgMHgyZiwgMHhmYSwgMHhkZCwgMHg0ZCwgMHhhNSwgMHg3ZiwgMHg4OSwgMHhhNSwgMHhmZiwKICAgICAgICAgICAgMHg1YiwgMHhhOSwgMHhiNCwgMHhhZiwgMHhmMSwgMHgzNCwgMHhiZiwgMHhlYiwgMHg3NSwgMHgzNiwKICAgICAgICAgICAgMHg5NSwgMHhmZSwgMHgyNiwgMHg5NiwgMHg2MCwgMHhmZSwgMHhmZiwgMHhiYSwgMHhmZiwgMHg0MCwKICAgICAgICBdKTsKICAgICAgICBlbmNvZGVkRnJhbWUuZGF0YSA9IG5ld0RhdGE7CiAgICB9CiAgICByZXR1cm4gZW5jb2RlZEZyYW1lOwp9CmZ1bmN0aW9uIHNldFdyaXRlSVYoY29ubmVjdGlvbklkLCBrZXlJZCwgd3JpdGVJVikgewogICAgY29uc3Qga2V5ID0gW2Nvbm5lY3Rpb25JZCwga2V5SWQudG9TdHJpbmcoKV0uam9pbignOicpOwogICAgd3JpdGVJVk1hcC5zZXQoa2V5LCB3cml0ZUlWKTsKfQpmdW5jdGlvbiBnZXRXcml0ZUlWKGNvbm5lY3Rpb25JZCwga2V5SWQpIHsKICAgIGNvbnN0IGtleSA9IFtjb25uZWN0aW9uSWQsIGtleUlkLnRvU3RyaW5nKCldLmpvaW4oJzonKTsKICAgIHJldHVybiB3cml0ZUlWTWFwLmdldChrZXkpOwp9CmZ1bmN0aW9uIGdlbmVyYXRlSVYoY291bnQsIGNvbm5lY3Rpb25JZCwga2V5SWQpIHsKICAgIC8vIFRPRE86IGtleUlkIOOBjCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgNyBieXRlIOOCkui2heOBiOOBpuOBhOOBn+WgtOWQiOOBr+OCqOODqeODvOOBi+S+i+WklgogICAgLy8gVE9ETzogY291bnQg44GMIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCA3IGJ5dGUg44KS6LaF44GI44Gm44GE44Gf5aC05ZCI44Gv44Ko44Op44O844GL5L6L5aSWCiAgICAvLyAzMiBiaXQg44G+44GnCiAgICBpZiAobWF4S2V5SWQgPCBrZXlJZCB8fCBtYXhDb3VudCA8IGNvdW50KSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFWENFRURFRC1NQVhJTVVNLUJST0FEQ0FTVElORy1USU1FJyk7CiAgICB9CiAgICBjb25zdCB3cml0ZUlWID0gZ2V0V3JpdGVJVihjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgIGlmICghd3JpdGVJVikgewogICAgICAgIHRocm93IG5ldyBFcnJvcignV1JJVEVJVi1OT1QtRk9VTkQnKTsKICAgIH0KICAgIGNvbnN0IHBhZGRpbmdMZW5ndGggPSBObiAtIFVpbnQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UOwogICAgY29uc3QgY291bnRXaXRoUGFkZGluZ0J1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihObik7CiAgICBjb25zdCBjb3VudFdpdGhQYWRkaW5nRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoY291bnRXaXRoUGFkZGluZ0J1ZmZlcik7CiAgICBjb3VudFdpdGhQYWRkaW5nRGF0YVZpZXcuc2V0VWludDMyKHBhZGRpbmdMZW5ndGgsIGNvdW50LCBiaWdFbmRpYW4pOwogICAgY29uc3QgaXYgPSBuZXcgVWludDhBcnJheShObik7CiAgICBjb25zdCBjb3VudFdpdGhQYWRkaW5nID0gbmV3IFVpbnQ4QXJyYXkoY291bnRXaXRoUGFkZGluZ0J1ZmZlcik7CiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE5uOyBpKyspIHsKICAgICAgICBpdltpXSA9IHdyaXRlSVZbaV0gXiBjb3VudFdpdGhQYWRkaW5nW2ldOwogICAgfQogICAgcmV0dXJuIGl2Owp9CmZ1bmN0aW9uIHBhcnNlUGF5bG9hZChwYXlsb2FkVHlwZSwgcGF5bG9hZCkgewogICAgcmV0dXJuIFsKICAgICAgICBuZXcgVWludDhBcnJheShwYXlsb2FkLCAwLCB1bmVuY3J5cHRlZEJ5dGVzW3BheWxvYWRUeXBlXSksCiAgICAgICAgbmV3IFVpbnQ4QXJyYXkocGF5bG9hZCwgdW5lbmNyeXB0ZWRCeXRlc1twYXlsb2FkVHlwZV0pLAogICAgXTsKfQpmdW5jdGlvbiBlbmNvZGVGcmFtZUFkZChoZWFkZXIsIHNmcmFtZUhlYWRlciwgY29ubmVjdGlvbklkKSB7CiAgICBjb25zdCBjb25uZWN0aW9uSWREYXRhID0gdGV4dEVuY29kZXIuZW5jb2RlKGNvbm5lY3Rpb25JZCk7CiAgICBjb25zdCBmcmFtZUFkZCA9IG5ldyBVaW50OEFycmF5KGhlYWRlci5ieXRlTGVuZ3RoICsgc2ZyYW1lSGVhZGVyLmJ5dGVMZW5ndGggKyBjb25uZWN0aW9uSWREYXRhLmJ5dGVMZW5ndGgpOwogICAgZnJhbWVBZGQuc2V0KGhlYWRlciwgMCk7CiAgICBmcmFtZUFkZC5zZXQoc2ZyYW1lSGVhZGVyLCBoZWFkZXIuYnl0ZUxlbmd0aCk7CiAgICBmcmFtZUFkZC5zZXQoY29ubmVjdGlvbklkRGF0YSwgaGVhZGVyLmJ5dGVMZW5ndGggKyBzZnJhbWVIZWFkZXIuYnl0ZUxlbmd0aCk7CiAgICByZXR1cm4gZnJhbWVBZGQ7Cn0KYXN5bmMgZnVuY3Rpb24gZW5jcnlwdEZ1bmN0aW9uKGVuY29kZWRGcmFtZSwgY29udHJvbGxlcikgewogICAgY29uc3QgeyBjb25uZWN0aW9uSWQsIGtleUlkLCBkZXJpdmVLZXkgfSA9IGdldExhdGVzdFNlbGZEZXJpdmVLZXkoKTsKICAgIGlmICghZGVyaXZlS2V5KSB7CiAgICAgICAgcmV0dXJuOwogICAgfQogICAgY29uc3QgY3VycmVudENvdW50ID0gZ2V0Q291bnQoY29ubmVjdGlvbklkKTsKICAgIC8vIGNvdW50IOOBjCAzMiBiaXQg5Lul5LiK44Gu5aC05ZCI44Gv5YGc5q2i44GZ44KLCiAgICBpZiAoY3VycmVudENvdW50ID4gbWF4Q291bnQpIHsKICAgICAgICBwb3N0TWVzc2FnZSh7IHR5cGU6ICdkaXNjb25uZWN0JyB9KTsKICAgIH0KICAgIGNvbnN0IGl2ID0gZ2VuZXJhdGVJVihjdXJyZW50Q291bnQsIGNvbm5lY3Rpb25JZCwga2V5SWQpOwogICAgaWYgKCFpdikgewogICAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IFtoZWFkZXIsIHBheWxvYWRdID0gcGFyc2VQYXlsb2FkKGVuY29kZWRGcmFtZS50eXBlLCBlbmNvZGVkRnJhbWUuZGF0YSk7CiAgICBjb25zdCBzZnJhbWVIZWFkZXIgPSBlbmNvZGVTRnJhbWVIZWFkZXIoMCwgY3VycmVudENvdW50LCBrZXlJZCk7CiAgICBjb25zdCBmcmFtZUFkZCA9IGVuY29kZUZyYW1lQWRkKGhlYWRlciwgc2ZyYW1lSGVhZGVyLCBjb25uZWN0aW9uSWQpOwogICAgY3J5cHRvLnN1YnRsZQogICAgICAgIC5lbmNyeXB0KHsKICAgICAgICBuYW1lOiAnQUVTLUdDTScsCiAgICAgICAgaXY6IGl2LAogICAgICAgIC8vIOaal+WPt+WMluOBleOCjOOBpuOBhOOBquOBhOmDqOWIhgogICAgICAgIGFkZGl0aW9uYWxEYXRhOiBmcmFtZUFkZCwKICAgIH0sIGRlcml2ZUtleSwgcGF5bG9hZCkKICAgICAgICAudGhlbigoY2lwaGVyVGV4dCkgPT4gewogICAgICAgIGNvbnN0IG5ld0RhdGEgPSBuZXcgQXJyYXlCdWZmZXIoZnJhbWVBZGQuYnl0ZUxlbmd0aCArIGNpcGhlclRleHQuYnl0ZUxlbmd0aCk7CiAgICAgICAgY29uc3QgbmV3RGF0YVVpbnQ4ID0gbmV3IFVpbnQ4QXJyYXkobmV3RGF0YSk7CiAgICAgICAgbmV3RGF0YVVpbnQ4LnNldChmcmFtZUFkZCwgMCk7CiAgICAgICAgbmV3RGF0YVVpbnQ4LnNldChuZXcgVWludDhBcnJheShjaXBoZXJUZXh0KSwgZnJhbWVBZGQuYnl0ZUxlbmd0aCk7CiAgICAgICAgZW5jb2RlZEZyYW1lLmRhdGEgPSBuZXdEYXRhOwogICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShlbmNvZGVkRnJhbWUpOwogICAgfSk7CiAgICBzZXRDb3VudChjb25uZWN0aW9uSWQsIGN1cnJlbnRDb3VudCArIDEpOwp9CmFzeW5jIGZ1bmN0aW9uIGRlY3J5cHRGdW5jdGlvbihlbmNvZGVkRnJhbWUsIGNvbnRyb2xsZXIpIHsKICAgIC8vIOepuuODleODrOODvOODoOWvvuW/nAogICAgaWYgKGVuY29kZWRGcmFtZS5kYXRhLmJ5dGVMZW5ndGggPCAxKSB7CiAgICAgICAgcmV0dXJuOwogICAgfQogICAgdHJ5IHsKICAgICAgICBjb25zdCBmcmFtZU1ldGFkYXRhQnVmZmVyID0gZW5jb2RlZEZyYW1lLmRhdGEuc2xpY2UoMCwgdW5lbmNyeXB0ZWRCeXRlc1tlbmNvZGVkRnJhbWUudHlwZV0pOwogICAgICAgIGNvbnN0IGZyYW1lTWV0YWRhdGEgPSBuZXcgVWludDhBcnJheShmcmFtZU1ldGFkYXRhQnVmZmVyKTsKICAgICAgICBjb25zdCBbc2ZyYW1lSGVhZGVyQnVmZmVyLCBjb25uZWN0aW9uSWRCdWZmZXIsIGVuY3J5cHRlZEZyYW1lQnVmZmVyXSA9IHNwbGl0SGVhZGVyKGVuY29kZWRGcmFtZS5kYXRhLnNsaWNlKHVuZW5jcnlwdGVkQnl0ZXNbZW5jb2RlZEZyYW1lLnR5cGVdKSk7CiAgICAgICAgY29uc3Qgc2ZyYW1lSGVhZGVyID0gbmV3IFVpbnQ4QXJyYXkoc2ZyYW1lSGVhZGVyQnVmZmVyKTsKICAgICAgICBjb25zdCBjb25uZWN0aW9uSWQgPSB0ZXh0RGVjb2Rlci5kZWNvZGUoY29ubmVjdGlvbklkQnVmZmVyKTsKICAgICAgICBjb25zdCBbcywgY291bnQsIGtleUlkXSA9IHBhcnNlU0ZyYW1lSGVhZGVyKHNmcmFtZUhlYWRlckJ1ZmZlcik7CiAgICAgICAgLy8g5LuK5Zue44GvIHMgZmxhZyDjga8gMCDjga7jgb8KICAgICAgICBpZiAocyAhPT0gMCkgewogICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VORVhQRUNURUQtUy1GTEFHJyk7CiAgICAgICAgfQogICAgICAgIGNvbnN0IGRlcml2ZUtleSA9IGdldFJlbW90ZURlcml2ZUtleShjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgICAgICBpZiAoIWRlcml2ZUtleSkgewogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIGNvbnN0IGl2ID0gZ2VuZXJhdGVJVihjb3VudCwgY29ubmVjdGlvbklkLCBrZXlJZCk7CiAgICAgICAgaWYgKCFpdikgewogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIGNvbnN0IGZyYW1lQWRkID0gZW5jb2RlRnJhbWVBZGQoZnJhbWVNZXRhZGF0YSwgc2ZyYW1lSGVhZGVyLCBjb25uZWN0aW9uSWQpOwogICAgICAgIGNyeXB0by5zdWJ0bGUKICAgICAgICAgICAgLmRlY3J5cHQoewogICAgICAgICAgICBuYW1lOiAnQUVTLUdDTScsCiAgICAgICAgICAgIGl2OiBpdiwKICAgICAgICAgICAgYWRkaXRpb25hbERhdGE6IGZyYW1lQWRkLAogICAgICAgIH0sIGRlcml2ZUtleSwgbmV3IFVpbnQ4QXJyYXkoZW5jcnlwdGVkRnJhbWVCdWZmZXIpKQogICAgICAgICAgICAudGhlbigocGxhaW5UZXh0KSA9PiB7CiAgICAgICAgICAgIGNvbnN0IG5ld0RhdGEgPSBuZXcgQXJyYXlCdWZmZXIoZnJhbWVNZXRhZGF0YUJ1ZmZlci5ieXRlTGVuZ3RoICsgcGxhaW5UZXh0LmJ5dGVMZW5ndGgpOwogICAgICAgICAgICBjb25zdCBuZXdVaW50OCA9IG5ldyBVaW50OEFycmF5KG5ld0RhdGEpOwogICAgICAgICAgICBuZXdVaW50OC5zZXQobmV3IFVpbnQ4QXJyYXkoZnJhbWVNZXRhZGF0YUJ1ZmZlciwgMCwgdW5lbmNyeXB0ZWRCeXRlc1tlbmNvZGVkRnJhbWUudHlwZV0pKTsKICAgICAgICAgICAgbmV3VWludDguc2V0KG5ldyBVaW50OEFycmF5KHBsYWluVGV4dCksIHVuZW5jcnlwdGVkQnl0ZXNbZW5jb2RlZEZyYW1lLnR5cGVdKTsKICAgICAgICAgICAgZW5jb2RlZEZyYW1lLmRhdGEgPSBuZXdEYXRhOwogICAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUoZW5jb2RlZEZyYW1lKTsKICAgICAgICB9KTsKICAgIH0KICAgIGNhdGNoIChlKSB7CiAgICAgICAgLy8g5oOz5a6a5aSW44Gu44OR44Kx44OD44OI44OV44Kp44O844Oe44OD44OI44KS5Y+X5L+h44GX44Gf5aC05ZCICiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKHNpbGVuY2VGcmFtZShlbmNvZGVkRnJhbWUpKTsKICAgIH0KfQovKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvdHJpcGxlLXNsYXNoLXJlZmVyZW5jZSAqLwovLy8gPHJlZmVyZW5jZSBwYXRoPSIuL2UyZWUudHMiLz4KLy8gbm9uY2Ug44K144Kk44K6CmNvbnN0IE5uID0gMTI7Ci8vIGtleSDjgrXjgqTjgroKY29uc3QgTmsgPSAxNjsKLy8ga2V5IOOCteOCpOOCuu+8iGJpdO+8iQpjb25zdCBrZXlMZW5ndGggPSBOayAqIDg7CmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlRGVyaXZlS2V5KG1hdGVyaWFsKSB7CiAgICBjb25zdCBzYWx0ID0gdGV4dEVuY29kZXIuZW5jb2RlKCdTRnJhbWUxMCcpOwogICAgY29uc3QgaW5mbyA9IHRleHRFbmNvZGVyLmVuY29kZSgna2V5Jyk7CiAgICBjb25zdCBkZXJpdmVLZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRlcml2ZUtleSh7CiAgICAgICAgbmFtZTogJ0hLREYnLAogICAgICAgIHNhbHQ6IHNhbHQsCiAgICAgICAgaGFzaDogJ1NIQS0yNTYnLAogICAgICAgIGluZm86IGluZm8sCiAgICB9LCBtYXRlcmlhbCwgewogICAgICAgIG5hbWU6ICdBRVMtR0NNJywKICAgICAgICBsZW5ndGg6IGtleUxlbmd0aCwKICAgIH0sIGZhbHNlLCBbJ2VuY3J5cHQnLCAnZGVjcnlwdCddKTsKICAgIHJldHVybiBkZXJpdmVLZXk7Cn0KYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVXcml0ZUlWKG1hdGVyaWFsKSB7CiAgICBjb25zdCBzYWx0ID0gdGV4dEVuY29kZXIuZW5jb2RlKCdTRnJhbWUxMCcpOwogICAgY29uc3QgaW5mbyA9IHRleHRFbmNvZGVyLmVuY29kZSgnc2FsdCcpOwogICAgY29uc3Qgd3JpdGVJVkJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGVyaXZlQml0cyh7CiAgICAgICAgbmFtZTogJ0hLREYnLAogICAgICAgIHNhbHQ6IHNhbHQsCiAgICAgICAgaGFzaDogJ1NIQS0zODQnLAogICAgICAgIGluZm86IGluZm8sCiAgICB9LCBtYXRlcmlhbCwgCiAgICAvLyBJViDjga8gOTYg44OT44OD44OI44Gq44Gu44GnCiAgICBObiAqIDgpOwogICAgY29uc3Qgd3JpdGVJViA9IG5ldyBVaW50OEFycmF5KHdyaXRlSVZCdWZmZXIpOwogICAgcmV0dXJuIHdyaXRlSVY7Cn0KbGV0IHJlbW92YWxUaW1lb3V0SWQgPSAwOwpvbm1lc3NhZ2UgPSAoZXZlbnQpID0+IHsKICAgIGNvbnN0IHsgdHlwZSB9ID0gZXZlbnQuZGF0YTsKICAgIGlmICh0eXBlID09PSAnc2VsZlNlY3JldEtleU1hdGVyaWFsJykgewogICAgICAgIGNvbnN0IHsgc2VsZlNlY3JldEtleU1hdGVyaWFsLCBzZWxmQ29ubmVjdGlvbklkLCBzZWxmS2V5SWQsIHdhaXRpbmdUaW1lIH0gPSBldmVudC5kYXRhOwogICAgICAgIGNvbnN0IHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4gewogICAgICAgICAgICBjcnlwdG8uc3VidGxlCiAgICAgICAgICAgICAgICAuaW1wb3J0S2V5KCdyYXcnLCBzZWxmU2VjcmV0S2V5TWF0ZXJpYWwuYnVmZmVyLCAnSEtERicsIGZhbHNlLCBbJ2Rlcml2ZUJpdHMnLCAnZGVyaXZlS2V5J10pCiAgICAgICAgICAgICAgICAudGhlbigobWF0ZXJpYWwpID0+IHsKICAgICAgICAgICAgICAgIGdlbmVyYXRlRGVyaXZlS2V5KG1hdGVyaWFsKS50aGVuKChkZXJpdmVLZXkpID0+IHsKICAgICAgICAgICAgICAgICAgICBzZXRTZWxmRGVyaXZlS2V5KHNlbGZDb25uZWN0aW9uSWQsIHNlbGZLZXlJZCwgZGVyaXZlS2V5KTsKICAgICAgICAgICAgICAgIH0pOwogICAgICAgICAgICAgICAgZ2VuZXJhdGVXcml0ZUlWKG1hdGVyaWFsKS50aGVuKCh3cml0ZUlWKSA9PiB7CiAgICAgICAgICAgICAgICAgICAgc2V0V3JpdGVJVihzZWxmQ29ubmVjdGlvbklkLCBzZWxmS2V5SWQsIHdyaXRlSVYpOwogICAgICAgICAgICAgICAgfSk7CiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTsKICAgICAgICAgICAgfSk7CiAgICAgICAgfSwgd2FpdGluZ1RpbWUgfHwgMCk7CiAgICAgICAgLy8gVE9ETzogKzEwMDAg44Gn6Y2155Sf5oiQ5b6M44Gr5a6f6KGM44GV44KM44KL44KI44GG44Gr44GX44Gm44GE44KL44GM55+t44GE5aC05ZCI44Gv5Ly444Gw44GZCiAgICAgICAgY29uc3QgcmVtb3ZhbFdhaXRpbmdUaW1lID0gKHdhaXRpbmdUaW1lIHx8IDApICsgMTAwMDsKICAgICAgICBpZiAocmVtb3ZhbFRpbWVvdXRJZCkgewogICAgICAgICAgICAvLyDli5XkvZzmuIjjgb/jgr/jgqTjg57jg7zmnInjgooKICAgICAgICAgICAgaWYgKHdhaXRpbmdUaW1lKSB7CiAgICAgICAgICAgICAgICAvLyBjb25uZWN0aW9uLmRlc3Ryb3llZAogICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHJlbW92YWxUaW1lb3V0SWQpOwogICAgICAgICAgICAgICAgcmVtb3ZhbFRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4gewogICAgICAgICAgICAgICAgICAgIHJlbW92ZU9sZFJlbW90ZURlcml2ZUtleXMoKTsKICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQocmVtb3ZhbFRpbWVvdXRJZCk7CiAgICAgICAgICAgICAgICAgICAgcmVtb3ZhbFRpbWVvdXRJZCA9IDA7CiAgICAgICAgICAgICAgICB9LCByZW1vdmFsV2FpdGluZ1RpbWUpOwogICAgICAgICAgICB9CiAgICAgICAgfQogICAgICAgIGVsc2UgewogICAgICAgICAgICAvLyDli5XkvZzmuIjjgb/jgr/jgqTjg57jg7zjgarjgZcKICAgICAgICAgICAgLy8gY29ubmVjdGlvbi5jcmVhdGVkIOOBruWgtOWQiOOCguWwkeOBl+Wun+ihjOOCkumBheOCieOBm+OCiwogICAgICAgICAgICByZW1vdmFsVGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7CiAgICAgICAgICAgICAgICByZW1vdmVPbGRSZW1vdGVEZXJpdmVLZXlzKCk7CiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQocmVtb3ZhbFRpbWVvdXRJZCk7CiAgICAgICAgICAgICAgICByZW1vdmFsVGltZW91dElkID0gMDsKICAgICAgICAgICAgfSwgcmVtb3ZhbFdhaXRpbmdUaW1lKTsKICAgICAgICB9CiAgICB9CiAgICBlbHNlIGlmICh0eXBlID09PSAncmVtb3RlU2VjcmV0S2V5TWF0ZXJpYWxzJykgewogICAgICAgIGNvbnN0IHsgcmVtb3RlU2VjcmV0S2V5TWF0ZXJpYWxzIH0gPSBldmVudC5kYXRhOwogICAgICAgIGZvciAoY29uc3QgW2Nvbm5lY3Rpb25JZCwgcmVtb3RlU2VjcmV0S2V5TWF0ZXJpYWxdIG9mIE9iamVjdC5lbnRyaWVzKHJlbW90ZVNlY3JldEtleU1hdGVyaWFscykpIHsKICAgICAgICAgICAgY29uc3QgeyBrZXlJZCwgc2VjcmV0S2V5TWF0ZXJpYWwgfSA9IHJlbW90ZVNlY3JldEtleU1hdGVyaWFsOwogICAgICAgICAgICBjcnlwdG8uc3VidGxlCiAgICAgICAgICAgICAgICAuaW1wb3J0S2V5KCdyYXcnLCBzZWNyZXRLZXlNYXRlcmlhbC5idWZmZXIsICdIS0RGJywgZmFsc2UsIFsnZGVyaXZlQml0cycsICdkZXJpdmVLZXknXSkKICAgICAgICAgICAgICAgIC50aGVuKChtYXRlcmlhbCkgPT4gewogICAgICAgICAgICAgICAgZ2VuZXJhdGVEZXJpdmVLZXkobWF0ZXJpYWwpLnRoZW4oKGRlcml2ZUtleSkgPT4gewogICAgICAgICAgICAgICAgICAgIHNldFJlbW90ZURlcml2ZUtleShjb25uZWN0aW9uSWQsIGtleUlkLCBkZXJpdmVLZXkpOwogICAgICAgICAgICAgICAgfSk7CiAgICAgICAgICAgICAgICBnZW5lcmF0ZVdyaXRlSVYobWF0ZXJpYWwpLnRoZW4oKHdyaXRlSVYpID0+IHsKICAgICAgICAgICAgICAgICAgICBzZXRXcml0ZUlWKGNvbm5lY3Rpb25JZCwga2V5SWQsIHdyaXRlSVYpOwogICAgICAgICAgICAgICAgfSk7CiAgICAgICAgICAgICAgICBzZXRMYXRlc3RSZW1vdGVLZXlJZChjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgICAgICAgICAgfSk7CiAgICAgICAgfQogICAgfQogICAgZWxzZSBpZiAodHlwZSA9PT0gJ3JlbW92ZVJlbW90ZURlcml2ZUtleScpIHsKICAgICAgICBjb25zdCB7IGNvbm5lY3Rpb25JZCB9ID0gZXZlbnQuZGF0YTsKICAgICAgICByZW1vdmVEZXJpdmVLZXkoY29ubmVjdGlvbklkKTsKICAgIH0KICAgIGVsc2UgaWYgKHR5cGUgPT09ICdlbmNyeXB0JykgewogICAgICAgIGNvbnN0IHsgcmVhZGFibGVTdHJlYW0sIHdyaXRhYmxlU3RyZWFtIH0gPSBldmVudC5kYXRhOwogICAgICAgIGNvbnN0IHRyYW5zZm9ybVN0cmVhbSA9IG5ldyBUcmFuc2Zvcm1TdHJlYW0oewogICAgICAgICAgICB0cmFuc2Zvcm06IGVuY3J5cHRGdW5jdGlvbiwKICAgICAgICB9KTsKICAgICAgICByZWFkYWJsZVN0cmVhbS5waXBlVGhyb3VnaCh0cmFuc2Zvcm1TdHJlYW0pLnBpcGVUbyh3cml0YWJsZVN0cmVhbSk7CiAgICB9CiAgICBlbHNlIGlmICh0eXBlID09PSAnZGVjcnlwdCcpIHsKICAgICAgICBjb25zdCB7IHJlYWRhYmxlU3RyZWFtLCB3cml0YWJsZVN0cmVhbSB9ID0gZXZlbnQuZGF0YTsKICAgICAgICBjb25zdCB0cmFuc2Zvcm1TdHJlYW0gPSBuZXcgVHJhbnNmb3JtU3RyZWFtKHsKICAgICAgICAgICAgdHJhbnNmb3JtOiBkZWNyeXB0RnVuY3Rpb24sCiAgICAgICAgfSk7CiAgICAgICAgcmVhZGFibGVTdHJlYW0ucGlwZVRocm91Z2godHJhbnNmb3JtU3RyZWFtKS5waXBlVG8od3JpdGFibGVTdHJlYW0pOwogICAgfQogICAgZWxzZSBpZiAodHlwZSA9PT0gJ2NsZWFyJykgewogICAgICAgIGNvdW50TWFwLmNsZWFyKCk7CiAgICAgICAgd3JpdGVJVk1hcC5jbGVhcigpOwogICAgICAgIHJlbW90ZURlcml2ZUtleU1hcC5jbGVhcigpOwogICAgICAgIGxhdGVzdFJlbW90ZUtleUlkTWFwLmNsZWFyKCk7CiAgICAgICAgc2VsZkRlcml2ZUtleU1hcC5jbGVhcigpOwogICAgfQp9Owo=';
	class SoraE2EE {
	    constructor() {
	        // 対応しているかどうかの判断
	        // @ts-ignore トライアル段階の API なので無視する
	        const supportsInsertableStreams = !!RTCRtpSender.prototype.createEncodedStreams;
	        if (!supportsInsertableStreams) {
	            throw new Error('E2EE is not supported in this browser.');
	        }
	        this.worker = null;
	        this.onWorkerDisconnect = null;
	    }
	    // worker を起動する
	    startWorker() {
	        // ワーカーを起動する
	        const workerScript = atob(WORKER_SCRIPT);
	        this.worker = new Worker(URL.createObjectURL(new Blob([workerScript], { type: 'application/javascript' })));
	        this.worker.onmessage = (event) => {
	            const { operation } = event.data;
	            if (operation === 'disconnect' && typeof this.onWorkerDisconnect === 'function') {
	                this.onWorkerDisconnect();
	            }
	        };
	    }
	    // worker の掃除をする
	    clearWorker() {
	        if (this.worker) {
	            this.worker.postMessage({
	                type: 'clear',
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
	    setupSenderTransform(readableStream, writableStream) {
	        if (!this.worker) {
	            throw new Error('Worker is null. Call startWorker in advance.');
	        }
	        const message = {
	            type: 'encrypt',
	            readableStream: readableStream,
	            writableStream: writableStream,
	        };
	        this.worker.postMessage(message, [readableStream, writableStream]);
	    }
	    setupReceiverTransform(readableStream, writableStream) {
	        if (!this.worker) {
	            throw new Error('Worker is null. Call startWorker in advance.');
	        }
	        const message = {
	            type: 'decrypt',
	            readableStream: readableStream,
	            writableStream: writableStream,
	        };
	        this.worker.postMessage(message, [readableStream, writableStream]);
	    }
	    postRemoteSecretKeyMaterials(result) {
	        if (!this.worker) {
	            throw new Error('Worker is null. Call startWorker in advance.');
	        }
	        this.worker.postMessage({
	            type: 'remoteSecretKeyMaterials',
	            remoteSecretKeyMaterials: result.remoteSecretKeyMaterials,
	        });
	    }
	    postRemoveRemoteDeriveKey(connectionId) {
	        if (!this.worker) {
	            throw new Error('Worker is null. Call startWorker in advance.');
	        }
	        this.worker.postMessage({
	            type: 'removeRemoteDeriveKey',
	            connectionId: connectionId,
	        });
	    }
	    postSelfSecretKeyMaterial(selfConnectionId, selfKeyId, selfSecretKeyMaterial, waitingTime = 0) {
	        if (!this.worker) {
	            throw new Error('Worker is null. Call startWorker in advance.');
	        }
	        this.worker.postMessage({
	            type: 'selfSecretKeyMaterial',
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
	            console.warn('E2ee wasm is already loaded. Will not be reload.');
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
	        return '2021.1.0';
	    }
	    static wasmVersion() {
	        return window.e2ee.version();
	    }
	}

	/**
	 * @shiguredo/lyra-wasm
	 * Lyra V2 WebAssembly build
	 * @version: 2022.2.0
	 * @author: Shiguredo Inc.
	 * @license: Apache-2.0
	 **/

	/**
	 * Lyra のエンコード形式のバージョン。
	 *
	 * エンコード形式に非互換な変更が入った時点での google/lyra のバージョンが格納されている。
	 */
	const LYRA_VERSION$1 = "1.3.0";
	const DEFAULT_SAMPLE_RATE = 16000;
	const DEFAULT_BITRATE = 9200;
	const DEFAULT_ENABLE_DTX = false;
	const DEFAULT_CHANNELS = 1;

	const WEB_WORKER_SCRIPT = "KGZ1bmN0aW9uIChmYWN0b3J5KSB7CiAgdHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kID8gZGVmaW5lKGZhY3RvcnkpIDoKICBmYWN0b3J5KCk7Cn0pKChmdW5jdGlvbiAoKSB7ICd1c2Ugc3RyaWN0JzsKCiAgdmFyIEx5cmFXYXNtTW9kdWxlID0gKCgpID0+IHsKICAgIHZhciBfc2NyaXB0RGlyID0gKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGxvY2F0aW9uID09PSAndW5kZWZpbmVkJyA/IG5ldyAocmVxdWlyZSgndScgKyAncmwnKS5VUkwpKCdmaWxlOicgKyBfX2ZpbGVuYW1lKS5ocmVmIDogdHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyA/IGxvY2F0aW9uLmhyZWYgOiAoZG9jdW1lbnQuY3VycmVudFNjcmlwdCAmJiBkb2N1bWVudC5jdXJyZW50U2NyaXB0LnNyYyB8fCBuZXcgVVJMKCdseXJhX3N5bmNfd29ya2VyLmpzJywgZG9jdW1lbnQuYmFzZVVSSSkuaHJlZikpOwogICAgCiAgICByZXR1cm4gKAogIGZ1bmN0aW9uKEx5cmFXYXNtTW9kdWxlKSB7CiAgICBMeXJhV2FzbU1vZHVsZSA9IEx5cmFXYXNtTW9kdWxlIHx8IHt9OwoKICB2YXIgTW9kdWxlPXR5cGVvZiBMeXJhV2FzbU1vZHVsZSE9InVuZGVmaW5lZCI/THlyYVdhc21Nb2R1bGU6e307dmFyIHJlYWR5UHJvbWlzZVJlc29sdmUscmVhZHlQcm9taXNlUmVqZWN0O01vZHVsZVsicmVhZHkiXT1uZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLHJlamVjdCl7cmVhZHlQcm9taXNlUmVzb2x2ZT1yZXNvbHZlO3JlYWR5UHJvbWlzZVJlamVjdD1yZWplY3Q7fSk7dmFyIG1vZHVsZU92ZXJyaWRlcz1PYmplY3QuYXNzaWduKHt9LE1vZHVsZSk7dmFyIHRoaXNQcm9ncmFtPSIuL3RoaXMucHJvZ3JhbSI7dmFyIHF1aXRfPShzdGF0dXMsdG9UaHJvdyk9Pnt0aHJvdyB0b1Rocm93fTt2YXIgRU5WSVJPTk1FTlRfSVNfV0VCPXR5cGVvZiB3aW5kb3c9PSJvYmplY3QiO3ZhciBFTlZJUk9OTUVOVF9JU19XT1JLRVI9dHlwZW9mIGltcG9ydFNjcmlwdHM9PSJmdW5jdGlvbiI7dmFyIEVOVklST05NRU5UX0lTX05PREU9dHlwZW9mIHByb2Nlc3M9PSJvYmplY3QiJiZ0eXBlb2YgcHJvY2Vzcy52ZXJzaW9ucz09Im9iamVjdCImJnR5cGVvZiBwcm9jZXNzLnZlcnNpb25zLm5vZGU9PSJzdHJpbmciO3ZhciBFTlZJUk9OTUVOVF9JU19QVEhSRUFEPU1vZHVsZVsiRU5WSVJPTk1FTlRfSVNfUFRIUkVBRCJdfHxmYWxzZTt2YXIgc2NyaXB0RGlyZWN0b3J5PSIiO2Z1bmN0aW9uIGxvY2F0ZUZpbGUocGF0aCl7aWYoTW9kdWxlWyJsb2NhdGVGaWxlIl0pe3JldHVybiBNb2R1bGVbImxvY2F0ZUZpbGUiXShwYXRoLHNjcmlwdERpcmVjdG9yeSl9cmV0dXJuIHNjcmlwdERpcmVjdG9yeStwYXRofXZhciByZWFkXyxyZWFkQXN5bmMscmVhZEJpbmFyeTtmdW5jdGlvbiBsb2dFeGNlcHRpb25PbkV4aXQoZSl7aWYoZSBpbnN0YW5jZW9mIEV4aXRTdGF0dXMpcmV0dXJuO2xldCB0b0xvZz1lO2VycigiZXhpdGluZyBkdWUgdG8gZXhjZXB0aW9uOiAiK3RvTG9nKTt9aWYoRU5WSVJPTk1FTlRfSVNfTk9ERSl7aWYoRU5WSVJPTk1FTlRfSVNfV09SS0VSKXtzY3JpcHREaXJlY3Rvcnk9cmVxdWlyZSgicGF0aCIpLmRpcm5hbWUoc2NyaXB0RGlyZWN0b3J5KSsiLyI7fWVsc2Uge3NjcmlwdERpcmVjdG9yeT1fX2Rpcm5hbWUrIi8iO312YXIgZnMsbm9kZVBhdGg7aWYodHlwZW9mIHJlcXVpcmU9PT0iZnVuY3Rpb24iKXtmcz1yZXF1aXJlKCJmcyIpO25vZGVQYXRoPXJlcXVpcmUoInBhdGgiKTt9cmVhZF89KGZpbGVuYW1lLGJpbmFyeSk9PntmaWxlbmFtZT1ub2RlUGF0aFsibm9ybWFsaXplIl0oZmlsZW5hbWUpO3JldHVybiBmcy5yZWFkRmlsZVN5bmMoZmlsZW5hbWUsYmluYXJ5P3VuZGVmaW5lZDoidXRmOCIpfTtyZWFkQmluYXJ5PWZpbGVuYW1lPT57dmFyIHJldD1yZWFkXyhmaWxlbmFtZSx0cnVlKTtpZighcmV0LmJ1ZmZlcil7cmV0PW5ldyBVaW50OEFycmF5KHJldCk7fXJldHVybiByZXR9O3JlYWRBc3luYz0oZmlsZW5hbWUsb25sb2FkLG9uZXJyb3IpPT57ZmlsZW5hbWU9bm9kZVBhdGhbIm5vcm1hbGl6ZSJdKGZpbGVuYW1lKTtmcy5yZWFkRmlsZShmaWxlbmFtZSxmdW5jdGlvbihlcnIsZGF0YSl7aWYoZXJyKW9uZXJyb3IoZXJyKTtlbHNlIG9ubG9hZChkYXRhLmJ1ZmZlcik7fSk7fTtpZihwcm9jZXNzWyJhcmd2Il0ubGVuZ3RoPjEpe3RoaXNQcm9ncmFtPXByb2Nlc3NbImFyZ3YiXVsxXS5yZXBsYWNlKC9cXC9nLCIvIik7fXByb2Nlc3NbImFyZ3YiXS5zbGljZSgyKTtwcm9jZXNzWyJvbiJdKCJ1bmNhdWdodEV4Y2VwdGlvbiIsZnVuY3Rpb24oZXgpe2lmKCEoZXggaW5zdGFuY2VvZiBFeGl0U3RhdHVzKSl7dGhyb3cgZXh9fSk7cHJvY2Vzc1sib24iXSgidW5oYW5kbGVkUmVqZWN0aW9uIixmdW5jdGlvbihyZWFzb24pe3Rocm93IHJlYXNvbn0pO3F1aXRfPShzdGF0dXMsdG9UaHJvdyk9PntpZihrZWVwUnVudGltZUFsaXZlKCkpe3Byb2Nlc3NbImV4aXRDb2RlIl09c3RhdHVzO3Rocm93IHRvVGhyb3d9bG9nRXhjZXB0aW9uT25FeGl0KHRvVGhyb3cpO3Byb2Nlc3NbImV4aXQiXShzdGF0dXMpO307TW9kdWxlWyJpbnNwZWN0Il09ZnVuY3Rpb24oKXtyZXR1cm4gIltFbXNjcmlwdGVuIE1vZHVsZSBvYmplY3RdIn07bGV0IG5vZGVXb3JrZXJUaHJlYWRzO3RyeXtub2RlV29ya2VyVGhyZWFkcz1yZXF1aXJlKCJ3b3JrZXJfdGhyZWFkcyIpO31jYXRjaChlKXtjb25zb2xlLmVycm9yKCdUaGUgIndvcmtlcl90aHJlYWRzIiBtb2R1bGUgaXMgbm90IHN1cHBvcnRlZCBpbiB0aGlzIG5vZGUuanMgYnVpbGQgLSBwZXJoYXBzIGEgbmV3ZXIgdmVyc2lvbiBpcyBuZWVkZWQ/Jyk7dGhyb3cgZX1nbG9iYWwuV29ya2VyPW5vZGVXb3JrZXJUaHJlYWRzLldvcmtlcjt9ZWxzZSBpZihFTlZJUk9OTUVOVF9JU19XRUJ8fEVOVklST05NRU5UX0lTX1dPUktFUil7aWYoRU5WSVJPTk1FTlRfSVNfV09SS0VSKXtzY3JpcHREaXJlY3Rvcnk9c2VsZi5sb2NhdGlvbi5ocmVmO31lbHNlIGlmKHR5cGVvZiBkb2N1bWVudCE9InVuZGVmaW5lZCImJmRvY3VtZW50LmN1cnJlbnRTY3JpcHQpe3NjcmlwdERpcmVjdG9yeT1kb2N1bWVudC5jdXJyZW50U2NyaXB0LnNyYzt9aWYoX3NjcmlwdERpcil7c2NyaXB0RGlyZWN0b3J5PV9zY3JpcHREaXI7fWlmKHNjcmlwdERpcmVjdG9yeS5pbmRleE9mKCJibG9iOiIpIT09MCl7c2NyaXB0RGlyZWN0b3J5PXNjcmlwdERpcmVjdG9yeS5zdWJzdHIoMCxzY3JpcHREaXJlY3RvcnkucmVwbGFjZSgvWz8jXS4qLywiIikubGFzdEluZGV4T2YoIi8iKSsxKTt9ZWxzZSB7c2NyaXB0RGlyZWN0b3J5PSIiO31pZighRU5WSVJPTk1FTlRfSVNfTk9ERSl7cmVhZF89dXJsPT57dmFyIHhocj1uZXcgWE1MSHR0cFJlcXVlc3Q7eGhyLm9wZW4oIkdFVCIsdXJsLGZhbHNlKTt4aHIuc2VuZChudWxsKTtyZXR1cm4geGhyLnJlc3BvbnNlVGV4dH07aWYoRU5WSVJPTk1FTlRfSVNfV09SS0VSKXtyZWFkQmluYXJ5PXVybD0+e3ZhciB4aHI9bmV3IFhNTEh0dHBSZXF1ZXN0O3hoci5vcGVuKCJHRVQiLHVybCxmYWxzZSk7eGhyLnJlc3BvbnNlVHlwZT0iYXJyYXlidWZmZXIiO3hoci5zZW5kKG51bGwpO3JldHVybiBuZXcgVWludDhBcnJheSh4aHIucmVzcG9uc2UpfTt9cmVhZEFzeW5jPSh1cmwsb25sb2FkLG9uZXJyb3IpPT57dmFyIHhocj1uZXcgWE1MSHR0cFJlcXVlc3Q7eGhyLm9wZW4oIkdFVCIsdXJsLHRydWUpO3hoci5yZXNwb25zZVR5cGU9ImFycmF5YnVmZmVyIjt4aHIub25sb2FkPSgpPT57aWYoeGhyLnN0YXR1cz09MjAwfHx4aHIuc3RhdHVzPT0wJiZ4aHIucmVzcG9uc2Upe29ubG9hZCh4aHIucmVzcG9uc2UpO3JldHVybn1vbmVycm9yKCk7fTt4aHIub25lcnJvcj1vbmVycm9yO3hoci5zZW5kKG51bGwpO307fX1lbHNlO2lmKEVOVklST05NRU5UX0lTX05PREUpe2lmKHR5cGVvZiBwZXJmb3JtYW5jZT09InVuZGVmaW5lZCIpe2dsb2JhbC5wZXJmb3JtYW5jZT1yZXF1aXJlKCJwZXJmX2hvb2tzIikucGVyZm9ybWFuY2U7fX12YXIgZGVmYXVsdFByaW50PWNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7dmFyIGRlZmF1bHRQcmludEVycj1jb25zb2xlLndhcm4uYmluZChjb25zb2xlKTtpZihFTlZJUk9OTUVOVF9JU19OT0RFKXtkZWZhdWx0UHJpbnQ9c3RyPT5mcy53cml0ZVN5bmMoMSxzdHIrIlxuIik7ZGVmYXVsdFByaW50RXJyPXN0cj0+ZnMud3JpdGVTeW5jKDIsc3RyKyJcbiIpO312YXIgb3V0PU1vZHVsZVsicHJpbnQiXXx8ZGVmYXVsdFByaW50O3ZhciBlcnI9TW9kdWxlWyJwcmludEVyciJdfHxkZWZhdWx0UHJpbnRFcnI7T2JqZWN0LmFzc2lnbihNb2R1bGUsbW9kdWxlT3ZlcnJpZGVzKTttb2R1bGVPdmVycmlkZXM9bnVsbDtpZihNb2R1bGVbImFyZ3VtZW50cyJdKU1vZHVsZVsiYXJndW1lbnRzIl07aWYoTW9kdWxlWyJ0aGlzUHJvZ3JhbSJdKXRoaXNQcm9ncmFtPU1vZHVsZVsidGhpc1Byb2dyYW0iXTtpZihNb2R1bGVbInF1aXQiXSlxdWl0Xz1Nb2R1bGVbInF1aXQiXTt2YXIgUE9JTlRFUl9TSVpFPTQ7dmFyIHdhc21CaW5hcnk7aWYoTW9kdWxlWyJ3YXNtQmluYXJ5Il0pd2FzbUJpbmFyeT1Nb2R1bGVbIndhc21CaW5hcnkiXTt2YXIgbm9FeGl0UnVudGltZT1Nb2R1bGVbIm5vRXhpdFJ1bnRpbWUiXXx8dHJ1ZTtpZih0eXBlb2YgV2ViQXNzZW1ibHkhPSJvYmplY3QiKXthYm9ydCgibm8gbmF0aXZlIHdhc20gc3VwcG9ydCBkZXRlY3RlZCIpO312YXIgd2FzbU1lbW9yeTt2YXIgd2FzbU1vZHVsZTt2YXIgQUJPUlQ9ZmFsc2U7dmFyIEVYSVRTVEFUVVM7ZnVuY3Rpb24gYXNzZXJ0KGNvbmRpdGlvbix0ZXh0KXtpZighY29uZGl0aW9uKXthYm9ydCh0ZXh0KTt9fXZhciBVVEY4RGVjb2Rlcj10eXBlb2YgVGV4dERlY29kZXIhPSJ1bmRlZmluZWQiP25ldyBUZXh0RGVjb2RlcigidXRmOCIpOnVuZGVmaW5lZDtmdW5jdGlvbiBVVEY4QXJyYXlUb1N0cmluZyhoZWFwT3JBcnJheSxpZHgsbWF4Qnl0ZXNUb1JlYWQpe3ZhciBlbmRJZHg9aWR4K21heEJ5dGVzVG9SZWFkO3ZhciBlbmRQdHI9aWR4O3doaWxlKGhlYXBPckFycmF5W2VuZFB0cl0mJiEoZW5kUHRyPj1lbmRJZHgpKSsrZW5kUHRyO2lmKGVuZFB0ci1pZHg+MTYmJmhlYXBPckFycmF5LmJ1ZmZlciYmVVRGOERlY29kZXIpe3JldHVybiBVVEY4RGVjb2Rlci5kZWNvZGUoaGVhcE9yQXJyYXkuYnVmZmVyIGluc3RhbmNlb2YgU2hhcmVkQXJyYXlCdWZmZXI/aGVhcE9yQXJyYXkuc2xpY2UoaWR4LGVuZFB0cik6aGVhcE9yQXJyYXkuc3ViYXJyYXkoaWR4LGVuZFB0cikpfXZhciBzdHI9IiI7d2hpbGUoaWR4PGVuZFB0cil7dmFyIHUwPWhlYXBPckFycmF5W2lkeCsrXTtpZighKHUwJjEyOCkpe3N0cis9U3RyaW5nLmZyb21DaGFyQ29kZSh1MCk7Y29udGludWV9dmFyIHUxPWhlYXBPckFycmF5W2lkeCsrXSY2MztpZigodTAmMjI0KT09MTkyKXtzdHIrPVN0cmluZy5mcm9tQ2hhckNvZGUoKHUwJjMxKTw8Nnx1MSk7Y29udGludWV9dmFyIHUyPWhlYXBPckFycmF5W2lkeCsrXSY2MztpZigodTAmMjQwKT09MjI0KXt1MD0odTAmMTUpPDwxMnx1MTw8Nnx1Mjt9ZWxzZSB7dTA9KHUwJjcpPDwxOHx1MTw8MTJ8dTI8PDZ8aGVhcE9yQXJyYXlbaWR4KytdJjYzO31pZih1MDw2NTUzNil7c3RyKz1TdHJpbmcuZnJvbUNoYXJDb2RlKHUwKTt9ZWxzZSB7dmFyIGNoPXUwLTY1NTM2O3N0cis9U3RyaW5nLmZyb21DaGFyQ29kZSg1NTI5NnxjaD4+MTAsNTYzMjB8Y2gmMTAyMyk7fX1yZXR1cm4gc3RyfWZ1bmN0aW9uIFVURjhUb1N0cmluZyhwdHIsbWF4Qnl0ZXNUb1JlYWQpe3JldHVybiBwdHI/VVRGOEFycmF5VG9TdHJpbmcoSEVBUFU4LHB0cixtYXhCeXRlc1RvUmVhZCk6IiJ9ZnVuY3Rpb24gc3RyaW5nVG9VVEY4QXJyYXkoc3RyLGhlYXAsb3V0SWR4LG1heEJ5dGVzVG9Xcml0ZSl7aWYoIShtYXhCeXRlc1RvV3JpdGU+MCkpcmV0dXJuIDA7dmFyIHN0YXJ0SWR4PW91dElkeDt2YXIgZW5kSWR4PW91dElkeCttYXhCeXRlc1RvV3JpdGUtMTtmb3IodmFyIGk9MDtpPHN0ci5sZW5ndGg7KytpKXt2YXIgdT1zdHIuY2hhckNvZGVBdChpKTtpZih1Pj01NTI5NiYmdTw9NTczNDMpe3ZhciB1MT1zdHIuY2hhckNvZGVBdCgrK2kpO3U9NjU1MzYrKCh1JjEwMjMpPDwxMCl8dTEmMTAyMzt9aWYodTw9MTI3KXtpZihvdXRJZHg+PWVuZElkeClicmVhaztoZWFwW291dElkeCsrXT11O31lbHNlIGlmKHU8PTIwNDcpe2lmKG91dElkeCsxPj1lbmRJZHgpYnJlYWs7aGVhcFtvdXRJZHgrK109MTkyfHU+PjY7aGVhcFtvdXRJZHgrK109MTI4fHUmNjM7fWVsc2UgaWYodTw9NjU1MzUpe2lmKG91dElkeCsyPj1lbmRJZHgpYnJlYWs7aGVhcFtvdXRJZHgrK109MjI0fHU+PjEyO2hlYXBbb3V0SWR4KytdPTEyOHx1Pj42JjYzO2hlYXBbb3V0SWR4KytdPTEyOHx1JjYzO31lbHNlIHtpZihvdXRJZHgrMz49ZW5kSWR4KWJyZWFrO2hlYXBbb3V0SWR4KytdPTI0MHx1Pj4xODtoZWFwW291dElkeCsrXT0xMjh8dT4+MTImNjM7aGVhcFtvdXRJZHgrK109MTI4fHU+PjYmNjM7aGVhcFtvdXRJZHgrK109MTI4fHUmNjM7fX1oZWFwW291dElkeF09MDtyZXR1cm4gb3V0SWR4LXN0YXJ0SWR4fWZ1bmN0aW9uIHN0cmluZ1RvVVRGOChzdHIsb3V0UHRyLG1heEJ5dGVzVG9Xcml0ZSl7cmV0dXJuIHN0cmluZ1RvVVRGOEFycmF5KHN0cixIRUFQVTgsb3V0UHRyLG1heEJ5dGVzVG9Xcml0ZSl9ZnVuY3Rpb24gbGVuZ3RoQnl0ZXNVVEY4KHN0cil7dmFyIGxlbj0wO2Zvcih2YXIgaT0wO2k8c3RyLmxlbmd0aDsrK2kpe3ZhciBjPXN0ci5jaGFyQ29kZUF0KGkpO2lmKGM8PTEyNyl7bGVuKys7fWVsc2UgaWYoYzw9MjA0Nyl7bGVuKz0yO31lbHNlIGlmKGM+PTU1Mjk2JiZjPD01NzM0Myl7bGVuKz00OysraTt9ZWxzZSB7bGVuKz0zO319cmV0dXJuIGxlbn12YXIgYnVmZmVyLEhFQVA4LEhFQVBVOCxIRUFQMTYsSEVBUFUxNixIRUFQMzIsSEVBUFUzMixIRUFQRjMyLEhFQVBGNjQ7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRCl7YnVmZmVyPU1vZHVsZVsiYnVmZmVyIl07fWZ1bmN0aW9uIHVwZGF0ZUdsb2JhbEJ1ZmZlckFuZFZpZXdzKGJ1Zil7YnVmZmVyPWJ1ZjtNb2R1bGVbIkhFQVA4Il09SEVBUDg9bmV3IEludDhBcnJheShidWYpO01vZHVsZVsiSEVBUDE2Il09SEVBUDE2PW5ldyBJbnQxNkFycmF5KGJ1Zik7TW9kdWxlWyJIRUFQMzIiXT1IRUFQMzI9bmV3IEludDMyQXJyYXkoYnVmKTtNb2R1bGVbIkhFQVBVOCJdPUhFQVBVOD1uZXcgVWludDhBcnJheShidWYpO01vZHVsZVsiSEVBUFUxNiJdPUhFQVBVMTY9bmV3IFVpbnQxNkFycmF5KGJ1Zik7TW9kdWxlWyJIRUFQVTMyIl09SEVBUFUzMj1uZXcgVWludDMyQXJyYXkoYnVmKTtNb2R1bGVbIkhFQVBGMzIiXT1IRUFQRjMyPW5ldyBGbG9hdDMyQXJyYXkoYnVmKTtNb2R1bGVbIkhFQVBGNjQiXT1IRUFQRjY0PW5ldyBGbG9hdDY0QXJyYXkoYnVmKTt9dmFyIElOSVRJQUxfTUVNT1JZPU1vZHVsZVsiSU5JVElBTF9NRU1PUlkiXXx8NjcxMDg4NjQ7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRCl7d2FzbU1lbW9yeT1Nb2R1bGVbIndhc21NZW1vcnkiXTtidWZmZXI9TW9kdWxlWyJidWZmZXIiXTt9ZWxzZSB7aWYoTW9kdWxlWyJ3YXNtTWVtb3J5Il0pe3dhc21NZW1vcnk9TW9kdWxlWyJ3YXNtTWVtb3J5Il07fWVsc2Uge3dhc21NZW1vcnk9bmV3IFdlYkFzc2VtYmx5Lk1lbW9yeSh7ImluaXRpYWwiOklOSVRJQUxfTUVNT1JZLzY1NTM2LCJtYXhpbXVtIjpJTklUSUFMX01FTU9SWS82NTUzNiwic2hhcmVkIjp0cnVlfSk7aWYoISh3YXNtTWVtb3J5LmJ1ZmZlciBpbnN0YW5jZW9mIFNoYXJlZEFycmF5QnVmZmVyKSl7ZXJyKCJyZXF1ZXN0ZWQgYSBzaGFyZWQgV2ViQXNzZW1ibHkuTWVtb3J5IGJ1dCB0aGUgcmV0dXJuZWQgYnVmZmVyIGlzIG5vdCBhIFNoYXJlZEFycmF5QnVmZmVyLCBpbmRpY2F0aW5nIHRoYXQgd2hpbGUgdGhlIGJyb3dzZXIgaGFzIFNoYXJlZEFycmF5QnVmZmVyIGl0IGRvZXMgbm90IGhhdmUgV2ViQXNzZW1ibHkgdGhyZWFkcyBzdXBwb3J0IC0geW91IG1heSBuZWVkIHRvIHNldCBhIGZsYWciKTtpZihFTlZJUk9OTUVOVF9JU19OT0RFKXtlcnIoIihvbiBub2RlIHlvdSBtYXkgbmVlZDogLS1leHBlcmltZW50YWwtd2FzbS10aHJlYWRzIC0tZXhwZXJpbWVudGFsLXdhc20tYnVsay1tZW1vcnkgYW5kL29yIHJlY2VudCB2ZXJzaW9uKSIpO310aHJvdyBFcnJvcigiYmFkIG1lbW9yeSIpfX19aWYod2FzbU1lbW9yeSl7YnVmZmVyPXdhc21NZW1vcnkuYnVmZmVyO31JTklUSUFMX01FTU9SWT1idWZmZXIuYnl0ZUxlbmd0aDt1cGRhdGVHbG9iYWxCdWZmZXJBbmRWaWV3cyhidWZmZXIpO3ZhciB3YXNtVGFibGU7dmFyIF9fQVRQUkVSVU5fXz1bXTt2YXIgX19BVElOSVRfXz1bXTt2YXIgX19BVFBPU1RSVU5fXz1bXTtmdW5jdGlvbiBrZWVwUnVudGltZUFsaXZlKCl7cmV0dXJuIG5vRXhpdFJ1bnRpbWV9ZnVuY3Rpb24gcHJlUnVuKCl7aWYoTW9kdWxlWyJwcmVSdW4iXSl7aWYodHlwZW9mIE1vZHVsZVsicHJlUnVuIl09PSJmdW5jdGlvbiIpTW9kdWxlWyJwcmVSdW4iXT1bTW9kdWxlWyJwcmVSdW4iXV07d2hpbGUoTW9kdWxlWyJwcmVSdW4iXS5sZW5ndGgpe2FkZE9uUHJlUnVuKE1vZHVsZVsicHJlUnVuIl0uc2hpZnQoKSk7fX1jYWxsUnVudGltZUNhbGxiYWNrcyhfX0FUUFJFUlVOX18pO31mdW5jdGlvbiBpbml0UnVudGltZSgpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuO2lmKCFNb2R1bGVbIm5vRlNJbml0Il0mJiFGUy5pbml0LmluaXRpYWxpemVkKUZTLmluaXQoKTtGUy5pZ25vcmVQZXJtaXNzaW9ucz1mYWxzZTtjYWxsUnVudGltZUNhbGxiYWNrcyhfX0FUSU5JVF9fKTt9ZnVuY3Rpb24gcG9zdFJ1bigpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuO2lmKE1vZHVsZVsicG9zdFJ1biJdKXtpZih0eXBlb2YgTW9kdWxlWyJwb3N0UnVuIl09PSJmdW5jdGlvbiIpTW9kdWxlWyJwb3N0UnVuIl09W01vZHVsZVsicG9zdFJ1biJdXTt3aGlsZShNb2R1bGVbInBvc3RSdW4iXS5sZW5ndGgpe2FkZE9uUG9zdFJ1bihNb2R1bGVbInBvc3RSdW4iXS5zaGlmdCgpKTt9fWNhbGxSdW50aW1lQ2FsbGJhY2tzKF9fQVRQT1NUUlVOX18pO31mdW5jdGlvbiBhZGRPblByZVJ1bihjYil7X19BVFBSRVJVTl9fLnVuc2hpZnQoY2IpO31mdW5jdGlvbiBhZGRPbkluaXQoY2Ipe19fQVRJTklUX18udW5zaGlmdChjYik7fWZ1bmN0aW9uIGFkZE9uUG9zdFJ1bihjYil7X19BVFBPU1RSVU5fXy51bnNoaWZ0KGNiKTt9dmFyIHJ1bkRlcGVuZGVuY2llcz0wO3ZhciBkZXBlbmRlbmNpZXNGdWxmaWxsZWQ9bnVsbDtmdW5jdGlvbiBnZXRVbmlxdWVSdW5EZXBlbmRlbmN5KGlkKXtyZXR1cm4gaWR9ZnVuY3Rpb24gYWRkUnVuRGVwZW5kZW5jeShpZCl7cnVuRGVwZW5kZW5jaWVzKys7aWYoTW9kdWxlWyJtb25pdG9yUnVuRGVwZW5kZW5jaWVzIl0pe01vZHVsZVsibW9uaXRvclJ1bkRlcGVuZGVuY2llcyJdKHJ1bkRlcGVuZGVuY2llcyk7fX1mdW5jdGlvbiByZW1vdmVSdW5EZXBlbmRlbmN5KGlkKXtydW5EZXBlbmRlbmNpZXMtLTtpZihNb2R1bGVbIm1vbml0b3JSdW5EZXBlbmRlbmNpZXMiXSl7TW9kdWxlWyJtb25pdG9yUnVuRGVwZW5kZW5jaWVzIl0ocnVuRGVwZW5kZW5jaWVzKTt9aWYocnVuRGVwZW5kZW5jaWVzPT0wKXtpZihkZXBlbmRlbmNpZXNGdWxmaWxsZWQpe3ZhciBjYWxsYmFjaz1kZXBlbmRlbmNpZXNGdWxmaWxsZWQ7ZGVwZW5kZW5jaWVzRnVsZmlsbGVkPW51bGw7Y2FsbGJhY2soKTt9fX1mdW5jdGlvbiBhYm9ydCh3aGF0KXtpZihNb2R1bGVbIm9uQWJvcnQiXSl7TW9kdWxlWyJvbkFib3J0Il0od2hhdCk7fXdoYXQ9IkFib3J0ZWQoIit3aGF0KyIpIjtlcnIod2hhdCk7QUJPUlQ9dHJ1ZTtFWElUU1RBVFVTPTE7d2hhdCs9Ii4gQnVpbGQgd2l0aCAtc0FTU0VSVElPTlMgZm9yIG1vcmUgaW5mby4iO3ZhciBlPW5ldyBXZWJBc3NlbWJseS5SdW50aW1lRXJyb3Iod2hhdCk7cmVhZHlQcm9taXNlUmVqZWN0KGUpO3Rocm93IGV9dmFyIGRhdGFVUklQcmVmaXg9ImRhdGE6YXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtO2Jhc2U2NCwiO2Z1bmN0aW9uIGlzRGF0YVVSSShmaWxlbmFtZSl7cmV0dXJuIGZpbGVuYW1lLnN0YXJ0c1dpdGgoZGF0YVVSSVByZWZpeCl9ZnVuY3Rpb24gaXNGaWxlVVJJKGZpbGVuYW1lKXtyZXR1cm4gZmlsZW5hbWUuc3RhcnRzV2l0aCgiZmlsZTovLyIpfXZhciB3YXNtQmluYXJ5RmlsZTtpZihNb2R1bGVbImxvY2F0ZUZpbGUiXSl7d2FzbUJpbmFyeUZpbGU9Imx5cmEud2FzbSI7aWYoIWlzRGF0YVVSSSh3YXNtQmluYXJ5RmlsZSkpe3dhc21CaW5hcnlGaWxlPWxvY2F0ZUZpbGUod2FzbUJpbmFyeUZpbGUpO319ZWxzZSB7d2FzbUJpbmFyeUZpbGU9bmV3IFVSTCgibHlyYS53YXNtIiwodHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbG9jYXRpb24gPT09ICd1bmRlZmluZWQnID8gbmV3IChyZXF1aXJlKCd1JyArICdybCcpLlVSTCkoJ2ZpbGU6JyArIF9fZmlsZW5hbWUpLmhyZWYgOiB0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnID8gbG9jYXRpb24uaHJlZiA6IChkb2N1bWVudC5jdXJyZW50U2NyaXB0ICYmIGRvY3VtZW50LmN1cnJlbnRTY3JpcHQuc3JjIHx8IG5ldyBVUkwoJ2x5cmFfc3luY193b3JrZXIuanMnLCBkb2N1bWVudC5iYXNlVVJJKS5ocmVmKSkpLnRvU3RyaW5nKCk7fWZ1bmN0aW9uIGdldEJpbmFyeShmaWxlKXt0cnl7aWYoZmlsZT09d2FzbUJpbmFyeUZpbGUmJndhc21CaW5hcnkpe3JldHVybiBuZXcgVWludDhBcnJheSh3YXNtQmluYXJ5KX1pZihyZWFkQmluYXJ5KXtyZXR1cm4gcmVhZEJpbmFyeShmaWxlKX10aHJvdyAiYm90aCBhc3luYyBhbmQgc3luYyBmZXRjaGluZyBvZiB0aGUgd2FzbSBmYWlsZWQifWNhdGNoKGVycil7YWJvcnQoZXJyKTt9fWZ1bmN0aW9uIGdldEJpbmFyeVByb21pc2UoKXtpZighd2FzbUJpbmFyeSYmKEVOVklST05NRU5UX0lTX1dFQnx8RU5WSVJPTk1FTlRfSVNfV09SS0VSKSl7aWYodHlwZW9mIGZldGNoPT0iZnVuY3Rpb24iJiYhaXNGaWxlVVJJKHdhc21CaW5hcnlGaWxlKSl7cmV0dXJuIGZldGNoKHdhc21CaW5hcnlGaWxlLHtjcmVkZW50aWFsczoic2FtZS1vcmlnaW4ifSkudGhlbihmdW5jdGlvbihyZXNwb25zZSl7aWYoIXJlc3BvbnNlWyJvayJdKXt0aHJvdyAiZmFpbGVkIHRvIGxvYWQgd2FzbSBiaW5hcnkgZmlsZSBhdCAnIit3YXNtQmluYXJ5RmlsZSsiJyJ9cmV0dXJuIHJlc3BvbnNlWyJhcnJheUJ1ZmZlciJdKCl9KS5jYXRjaChmdW5jdGlvbigpe3JldHVybiBnZXRCaW5hcnkod2FzbUJpbmFyeUZpbGUpfSl9ZWxzZSB7aWYocmVhZEFzeW5jKXtyZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSxyZWplY3Qpe3JlYWRBc3luYyh3YXNtQmluYXJ5RmlsZSxmdW5jdGlvbihyZXNwb25zZSl7cmVzb2x2ZShuZXcgVWludDhBcnJheShyZXNwb25zZSkpO30scmVqZWN0KTt9KX19fXJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uKCl7cmV0dXJuIGdldEJpbmFyeSh3YXNtQmluYXJ5RmlsZSl9KX1mdW5jdGlvbiBjcmVhdGVXYXNtKCl7dmFyIGluZm89eyJlbnYiOmFzbUxpYnJhcnlBcmcsIndhc2lfc25hcHNob3RfcHJldmlldzEiOmFzbUxpYnJhcnlBcmd9O2Z1bmN0aW9uIHJlY2VpdmVJbnN0YW5jZShpbnN0YW5jZSxtb2R1bGUpe3ZhciBleHBvcnRzPWluc3RhbmNlLmV4cG9ydHM7TW9kdWxlWyJhc20iXT1leHBvcnRzO3JlZ2lzdGVyVExTSW5pdChNb2R1bGVbImFzbSJdWyJfZW1zY3JpcHRlbl90bHNfaW5pdCJdKTt3YXNtVGFibGU9TW9kdWxlWyJhc20iXVsiX19pbmRpcmVjdF9mdW5jdGlvbl90YWJsZSJdO2FkZE9uSW5pdChNb2R1bGVbImFzbSJdWyJfX3dhc21fY2FsbF9jdG9ycyJdKTt3YXNtTW9kdWxlPW1vZHVsZTtpZighRU5WSVJPTk1FTlRfSVNfUFRIUkVBRCl7cmVtb3ZlUnVuRGVwZW5kZW5jeSgpO319aWYoIUVOVklST05NRU5UX0lTX1BUSFJFQUQpe2FkZFJ1bkRlcGVuZGVuY3koKTt9ZnVuY3Rpb24gcmVjZWl2ZUluc3RhbnRpYXRpb25SZXN1bHQocmVzdWx0KXtyZWNlaXZlSW5zdGFuY2UocmVzdWx0WyJpbnN0YW5jZSJdLHJlc3VsdFsibW9kdWxlIl0pO31mdW5jdGlvbiBpbnN0YW50aWF0ZUFycmF5QnVmZmVyKHJlY2VpdmVyKXtyZXR1cm4gZ2V0QmluYXJ5UHJvbWlzZSgpLnRoZW4oZnVuY3Rpb24oYmluYXJ5KXtyZXR1cm4gV2ViQXNzZW1ibHkuaW5zdGFudGlhdGUoYmluYXJ5LGluZm8pfSkudGhlbihmdW5jdGlvbihpbnN0YW5jZSl7cmV0dXJuIGluc3RhbmNlfSkudGhlbihyZWNlaXZlcixmdW5jdGlvbihyZWFzb24pe2VycigiZmFpbGVkIHRvIGFzeW5jaHJvbm91c2x5IHByZXBhcmUgd2FzbTogIityZWFzb24pO2Fib3J0KHJlYXNvbik7fSl9ZnVuY3Rpb24gaW5zdGFudGlhdGVBc3luYygpe2lmKCF3YXNtQmluYXJ5JiZ0eXBlb2YgV2ViQXNzZW1ibHkuaW5zdGFudGlhdGVTdHJlYW1pbmc9PSJmdW5jdGlvbiImJiFpc0RhdGFVUkkod2FzbUJpbmFyeUZpbGUpJiYhaXNGaWxlVVJJKHdhc21CaW5hcnlGaWxlKSYmIUVOVklST05NRU5UX0lTX05PREUmJnR5cGVvZiBmZXRjaD09ImZ1bmN0aW9uIil7cmV0dXJuIGZldGNoKHdhc21CaW5hcnlGaWxlLHtjcmVkZW50aWFsczoic2FtZS1vcmlnaW4ifSkudGhlbihmdW5jdGlvbihyZXNwb25zZSl7dmFyIHJlc3VsdD1XZWJBc3NlbWJseS5pbnN0YW50aWF0ZVN0cmVhbWluZyhyZXNwb25zZSxpbmZvKTtyZXR1cm4gcmVzdWx0LnRoZW4ocmVjZWl2ZUluc3RhbnRpYXRpb25SZXN1bHQsZnVuY3Rpb24ocmVhc29uKXtlcnIoIndhc20gc3RyZWFtaW5nIGNvbXBpbGUgZmFpbGVkOiAiK3JlYXNvbik7ZXJyKCJmYWxsaW5nIGJhY2sgdG8gQXJyYXlCdWZmZXIgaW5zdGFudGlhdGlvbiIpO3JldHVybiBpbnN0YW50aWF0ZUFycmF5QnVmZmVyKHJlY2VpdmVJbnN0YW50aWF0aW9uUmVzdWx0KX0pfSl9ZWxzZSB7cmV0dXJuIGluc3RhbnRpYXRlQXJyYXlCdWZmZXIocmVjZWl2ZUluc3RhbnRpYXRpb25SZXN1bHQpfX1pZihNb2R1bGVbImluc3RhbnRpYXRlV2FzbSJdKXt0cnl7dmFyIGV4cG9ydHM9TW9kdWxlWyJpbnN0YW50aWF0ZVdhc20iXShpbmZvLHJlY2VpdmVJbnN0YW5jZSk7cmV0dXJuIGV4cG9ydHN9Y2F0Y2goZSl7ZXJyKCJNb2R1bGUuaW5zdGFudGlhdGVXYXNtIGNhbGxiYWNrIGZhaWxlZCB3aXRoIGVycm9yOiAiK2UpO3JlYWR5UHJvbWlzZVJlamVjdChlKTt9fWluc3RhbnRpYXRlQXN5bmMoKS5jYXRjaChyZWFkeVByb21pc2VSZWplY3QpO3JldHVybiB7fX12YXIgdGVtcERvdWJsZTt2YXIgdGVtcEk2NDt2YXIgQVNNX0NPTlNUUz17MjA5NjAwOigpPT57cmV0dXJuIHR5cGVvZiB3YXNtT2Zmc2V0Q29udmVydGVyIT09InVuZGVmaW5lZCJ9fTtmdW5jdGlvbiBIYXZlT2Zmc2V0Q29udmVydGVyKCl7cmV0dXJuIHR5cGVvZiB3YXNtT2Zmc2V0Q29udmVydGVyIT09InVuZGVmaW5lZCJ9ZnVuY3Rpb24gRXhpdFN0YXR1cyhzdGF0dXMpe3RoaXMubmFtZT0iRXhpdFN0YXR1cyI7dGhpcy5tZXNzYWdlPSJQcm9ncmFtIHRlcm1pbmF0ZWQgd2l0aCBleGl0KCIrc3RhdHVzKyIpIjt0aGlzLnN0YXR1cz1zdGF0dXM7fWZ1bmN0aW9uIGtpbGxUaHJlYWQocHRocmVhZF9wdHIpe3ZhciB3b3JrZXI9UFRocmVhZC5wdGhyZWFkc1twdGhyZWFkX3B0cl07ZGVsZXRlIFBUaHJlYWQucHRocmVhZHNbcHRocmVhZF9wdHJdO3dvcmtlci50ZXJtaW5hdGUoKTtfX2Vtc2NyaXB0ZW5fdGhyZWFkX2ZyZWVfZGF0YShwdGhyZWFkX3B0cik7UFRocmVhZC5ydW5uaW5nV29ya2Vycy5zcGxpY2UoUFRocmVhZC5ydW5uaW5nV29ya2Vycy5pbmRleE9mKHdvcmtlciksMSk7d29ya2VyLnB0aHJlYWRfcHRyPTA7fWZ1bmN0aW9uIGNhbmNlbFRocmVhZChwdGhyZWFkX3B0cil7dmFyIHdvcmtlcj1QVGhyZWFkLnB0aHJlYWRzW3B0aHJlYWRfcHRyXTt3b3JrZXIucG9zdE1lc3NhZ2UoeyJjbWQiOiJjYW5jZWwifSk7fWZ1bmN0aW9uIGNsZWFudXBUaHJlYWQocHRocmVhZF9wdHIpe3ZhciB3b3JrZXI9UFRocmVhZC5wdGhyZWFkc1twdGhyZWFkX3B0cl07YXNzZXJ0KHdvcmtlcik7UFRocmVhZC5yZXR1cm5Xb3JrZXJUb1Bvb2wod29ya2VyKTt9ZnVuY3Rpb24gemVyb01lbW9yeShhZGRyZXNzLHNpemUpe0hFQVBVOC5maWxsKDAsYWRkcmVzcyxhZGRyZXNzK3NpemUpO3JldHVybiBhZGRyZXNzfWZ1bmN0aW9uIHNwYXduVGhyZWFkKHRocmVhZFBhcmFtcyl7dmFyIHdvcmtlcj1QVGhyZWFkLmdldE5ld1dvcmtlcigpO2lmKCF3b3JrZXIpe3JldHVybiA2fVBUaHJlYWQucnVubmluZ1dvcmtlcnMucHVzaCh3b3JrZXIpO1BUaHJlYWQucHRocmVhZHNbdGhyZWFkUGFyYW1zLnB0aHJlYWRfcHRyXT13b3JrZXI7d29ya2VyLnB0aHJlYWRfcHRyPXRocmVhZFBhcmFtcy5wdGhyZWFkX3B0cjt2YXIgbXNnPXsiY21kIjoicnVuIiwic3RhcnRfcm91dGluZSI6dGhyZWFkUGFyYW1zLnN0YXJ0Um91dGluZSwiYXJnIjp0aHJlYWRQYXJhbXMuYXJnLCJwdGhyZWFkX3B0ciI6dGhyZWFkUGFyYW1zLnB0aHJlYWRfcHRyfTt3b3JrZXIucnVuUHRocmVhZD0oKT0+e21zZy50aW1lPXBlcmZvcm1hbmNlLm5vdygpO3dvcmtlci5wb3N0TWVzc2FnZShtc2csdGhyZWFkUGFyYW1zLnRyYW5zZmVyTGlzdCk7fTtpZih3b3JrZXIubG9hZGVkKXt3b3JrZXIucnVuUHRocmVhZCgpO2RlbGV0ZSB3b3JrZXIucnVuUHRocmVhZDt9cmV0dXJuIDB9dmFyIFBBVEg9e2lzQWJzOnBhdGg9PnBhdGguY2hhckF0KDApPT09Ii8iLHNwbGl0UGF0aDpmaWxlbmFtZT0+e3ZhciBzcGxpdFBhdGhSZT0vXihcLz98KShbXHNcU10qPykoKD86XC57MSwyfXxbXlwvXSs/fCkoXC5bXi5cL10qfCkpKD86W1wvXSopJC87cmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpfSxub3JtYWxpemVBcnJheToocGFydHMsYWxsb3dBYm92ZVJvb3QpPT57dmFyIHVwPTA7Zm9yKHZhciBpPXBhcnRzLmxlbmd0aC0xO2k+PTA7aS0tKXt2YXIgbGFzdD1wYXJ0c1tpXTtpZihsYXN0PT09Ii4iKXtwYXJ0cy5zcGxpY2UoaSwxKTt9ZWxzZSBpZihsYXN0PT09Ii4uIil7cGFydHMuc3BsaWNlKGksMSk7dXArKzt9ZWxzZSBpZih1cCl7cGFydHMuc3BsaWNlKGksMSk7dXAtLTt9fWlmKGFsbG93QWJvdmVSb290KXtmb3IoO3VwO3VwLS0pe3BhcnRzLnVuc2hpZnQoIi4uIik7fX1yZXR1cm4gcGFydHN9LG5vcm1hbGl6ZTpwYXRoPT57dmFyIGlzQWJzb2x1dGU9UEFUSC5pc0FicyhwYXRoKSx0cmFpbGluZ1NsYXNoPXBhdGguc3Vic3RyKC0xKT09PSIvIjtwYXRoPVBBVEgubm9ybWFsaXplQXJyYXkocGF0aC5zcGxpdCgiLyIpLmZpbHRlcihwPT4hIXApLCFpc0Fic29sdXRlKS5qb2luKCIvIik7aWYoIXBhdGgmJiFpc0Fic29sdXRlKXtwYXRoPSIuIjt9aWYocGF0aCYmdHJhaWxpbmdTbGFzaCl7cGF0aCs9Ii8iO31yZXR1cm4gKGlzQWJzb2x1dGU/Ii8iOiIiKStwYXRofSxkaXJuYW1lOnBhdGg9Pnt2YXIgcmVzdWx0PVBBVEguc3BsaXRQYXRoKHBhdGgpLHJvb3Q9cmVzdWx0WzBdLGRpcj1yZXN1bHRbMV07aWYoIXJvb3QmJiFkaXIpe3JldHVybiAiLiJ9aWYoZGlyKXtkaXI9ZGlyLnN1YnN0cigwLGRpci5sZW5ndGgtMSk7fXJldHVybiByb290K2Rpcn0sYmFzZW5hbWU6cGF0aD0+e2lmKHBhdGg9PT0iLyIpcmV0dXJuICIvIjtwYXRoPVBBVEgubm9ybWFsaXplKHBhdGgpO3BhdGg9cGF0aC5yZXBsYWNlKC9cLyQvLCIiKTt2YXIgbGFzdFNsYXNoPXBhdGgubGFzdEluZGV4T2YoIi8iKTtpZihsYXN0U2xhc2g9PT0tMSlyZXR1cm4gcGF0aDtyZXR1cm4gcGF0aC5zdWJzdHIobGFzdFNsYXNoKzEpfSxqb2luOmZ1bmN0aW9uKCl7dmFyIHBhdGhzPUFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7cmV0dXJuIFBBVEgubm9ybWFsaXplKHBhdGhzLmpvaW4oIi8iKSl9LGpvaW4yOihsLHIpPT57cmV0dXJuIFBBVEgubm9ybWFsaXplKGwrIi8iK3IpfX07ZnVuY3Rpb24gZ2V0UmFuZG9tRGV2aWNlKCl7aWYodHlwZW9mIGNyeXB0bz09Im9iamVjdCImJnR5cGVvZiBjcnlwdG9bImdldFJhbmRvbVZhbHVlcyJdPT0iZnVuY3Rpb24iKXt2YXIgcmFuZG9tQnVmZmVyPW5ldyBVaW50OEFycmF5KDEpO3JldHVybiAoKT0+e2NyeXB0by5nZXRSYW5kb21WYWx1ZXMocmFuZG9tQnVmZmVyKTtyZXR1cm4gcmFuZG9tQnVmZmVyWzBdfX1lbHNlIGlmKEVOVklST05NRU5UX0lTX05PREUpe3RyeXt2YXIgY3J5cHRvX21vZHVsZT1yZXF1aXJlKCJjcnlwdG8iKTtyZXR1cm4gKCk9PmNyeXB0b19tb2R1bGVbInJhbmRvbUJ5dGVzIl0oMSlbMF19Y2F0Y2goZSl7fX1yZXR1cm4gKCk9PmFib3J0KCJyYW5kb21EZXZpY2UiKX12YXIgUEFUSF9GUz17cmVzb2x2ZTpmdW5jdGlvbigpe3ZhciByZXNvbHZlZFBhdGg9IiIscmVzb2x2ZWRBYnNvbHV0ZT1mYWxzZTtmb3IodmFyIGk9YXJndW1lbnRzLmxlbmd0aC0xO2k+PS0xJiYhcmVzb2x2ZWRBYnNvbHV0ZTtpLS0pe3ZhciBwYXRoPWk+PTA/YXJndW1lbnRzW2ldOkZTLmN3ZCgpO2lmKHR5cGVvZiBwYXRoIT0ic3RyaW5nIil7dGhyb3cgbmV3IFR5cGVFcnJvcigiQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MiKX1lbHNlIGlmKCFwYXRoKXtyZXR1cm4gIiJ9cmVzb2x2ZWRQYXRoPXBhdGgrIi8iK3Jlc29sdmVkUGF0aDtyZXNvbHZlZEFic29sdXRlPVBBVEguaXNBYnMocGF0aCk7fXJlc29sdmVkUGF0aD1QQVRILm5vcm1hbGl6ZUFycmF5KHJlc29sdmVkUGF0aC5zcGxpdCgiLyIpLmZpbHRlcihwPT4hIXApLCFyZXNvbHZlZEFic29sdXRlKS5qb2luKCIvIik7cmV0dXJuIChyZXNvbHZlZEFic29sdXRlPyIvIjoiIikrcmVzb2x2ZWRQYXRofHwiLiJ9LHJlbGF0aXZlOihmcm9tLHRvKT0+e2Zyb209UEFUSF9GUy5yZXNvbHZlKGZyb20pLnN1YnN0cigxKTt0bz1QQVRIX0ZTLnJlc29sdmUodG8pLnN1YnN0cigxKTtmdW5jdGlvbiB0cmltKGFycil7dmFyIHN0YXJ0PTA7Zm9yKDtzdGFydDxhcnIubGVuZ3RoO3N0YXJ0Kyspe2lmKGFycltzdGFydF0hPT0iIilicmVha312YXIgZW5kPWFyci5sZW5ndGgtMTtmb3IoO2VuZD49MDtlbmQtLSl7aWYoYXJyW2VuZF0hPT0iIilicmVha31pZihzdGFydD5lbmQpcmV0dXJuIFtdO3JldHVybiBhcnIuc2xpY2Uoc3RhcnQsZW5kLXN0YXJ0KzEpfXZhciBmcm9tUGFydHM9dHJpbShmcm9tLnNwbGl0KCIvIikpO3ZhciB0b1BhcnRzPXRyaW0odG8uc3BsaXQoIi8iKSk7dmFyIGxlbmd0aD1NYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLHRvUGFydHMubGVuZ3RoKTt2YXIgc2FtZVBhcnRzTGVuZ3RoPWxlbmd0aDtmb3IodmFyIGk9MDtpPGxlbmd0aDtpKyspe2lmKGZyb21QYXJ0c1tpXSE9PXRvUGFydHNbaV0pe3NhbWVQYXJ0c0xlbmd0aD1pO2JyZWFrfX12YXIgb3V0cHV0UGFydHM9W107Zm9yKHZhciBpPXNhbWVQYXJ0c0xlbmd0aDtpPGZyb21QYXJ0cy5sZW5ndGg7aSsrKXtvdXRwdXRQYXJ0cy5wdXNoKCIuLiIpO31vdXRwdXRQYXJ0cz1vdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtyZXR1cm4gb3V0cHV0UGFydHMuam9pbigiLyIpfX07ZnVuY3Rpb24gaW50QXJyYXlGcm9tU3RyaW5nKHN0cmluZ3ksZG9udEFkZE51bGwsbGVuZ3RoKXt2YXIgbGVuPWxlbmd0aD4wP2xlbmd0aDpsZW5ndGhCeXRlc1VURjgoc3RyaW5neSkrMTt2YXIgdThhcnJheT1uZXcgQXJyYXkobGVuKTt2YXIgbnVtQnl0ZXNXcml0dGVuPXN0cmluZ1RvVVRGOEFycmF5KHN0cmluZ3ksdThhcnJheSwwLHU4YXJyYXkubGVuZ3RoKTtpZihkb250QWRkTnVsbCl1OGFycmF5Lmxlbmd0aD1udW1CeXRlc1dyaXR0ZW47cmV0dXJuIHU4YXJyYXl9dmFyIFRUWT17dHR5czpbXSxpbml0OmZ1bmN0aW9uKCl7fSxzaHV0ZG93bjpmdW5jdGlvbigpe30scmVnaXN0ZXI6ZnVuY3Rpb24oZGV2LG9wcyl7VFRZLnR0eXNbZGV2XT17aW5wdXQ6W10sb3V0cHV0OltdLG9wczpvcHN9O0ZTLnJlZ2lzdGVyRGV2aWNlKGRldixUVFkuc3RyZWFtX29wcyk7fSxzdHJlYW1fb3BzOntvcGVuOmZ1bmN0aW9uKHN0cmVhbSl7dmFyIHR0eT1UVFkudHR5c1tzdHJlYW0ubm9kZS5yZGV2XTtpZighdHR5KXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig0Myl9c3RyZWFtLnR0eT10dHk7c3RyZWFtLnNlZWthYmxlPWZhbHNlO30sY2xvc2U6ZnVuY3Rpb24oc3RyZWFtKXtzdHJlYW0udHR5Lm9wcy5mc3luYyhzdHJlYW0udHR5KTt9LGZzeW5jOmZ1bmN0aW9uKHN0cmVhbSl7c3RyZWFtLnR0eS5vcHMuZnN5bmMoc3RyZWFtLnR0eSk7fSxyZWFkOmZ1bmN0aW9uKHN0cmVhbSxidWZmZXIsb2Zmc2V0LGxlbmd0aCxwb3Mpe2lmKCFzdHJlYW0udHR5fHwhc3RyZWFtLnR0eS5vcHMuZ2V0X2NoYXIpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDYwKX12YXIgYnl0ZXNSZWFkPTA7Zm9yKHZhciBpPTA7aTxsZW5ndGg7aSsrKXt2YXIgcmVzdWx0O3RyeXtyZXN1bHQ9c3RyZWFtLnR0eS5vcHMuZ2V0X2NoYXIoc3RyZWFtLnR0eSk7fWNhdGNoKGUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDI5KX1pZihyZXN1bHQ9PT11bmRlZmluZWQmJmJ5dGVzUmVhZD09PTApe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDYpfWlmKHJlc3VsdD09PW51bGx8fHJlc3VsdD09PXVuZGVmaW5lZClicmVhaztieXRlc1JlYWQrKztidWZmZXJbb2Zmc2V0K2ldPXJlc3VsdDt9aWYoYnl0ZXNSZWFkKXtzdHJlYW0ubm9kZS50aW1lc3RhbXA9RGF0ZS5ub3coKTt9cmV0dXJuIGJ5dGVzUmVhZH0sd3JpdGU6ZnVuY3Rpb24oc3RyZWFtLGJ1ZmZlcixvZmZzZXQsbGVuZ3RoLHBvcyl7aWYoIXN0cmVhbS50dHl8fCFzdHJlYW0udHR5Lm9wcy5wdXRfY2hhcil7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNjApfXRyeXtmb3IodmFyIGk9MDtpPGxlbmd0aDtpKyspe3N0cmVhbS50dHkub3BzLnB1dF9jaGFyKHN0cmVhbS50dHksYnVmZmVyW29mZnNldCtpXSk7fX1jYXRjaChlKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyOSl9aWYobGVuZ3RoKXtzdHJlYW0ubm9kZS50aW1lc3RhbXA9RGF0ZS5ub3coKTt9cmV0dXJuIGl9fSxkZWZhdWx0X3R0eV9vcHM6e2dldF9jaGFyOmZ1bmN0aW9uKHR0eSl7aWYoIXR0eS5pbnB1dC5sZW5ndGgpe3ZhciByZXN1bHQ9bnVsbDtpZihFTlZJUk9OTUVOVF9JU19OT0RFKXt2YXIgQlVGU0laRT0yNTY7dmFyIGJ1Zj1CdWZmZXIuYWxsb2MoQlVGU0laRSk7dmFyIGJ5dGVzUmVhZD0wO3RyeXtieXRlc1JlYWQ9ZnMucmVhZFN5bmMocHJvY2Vzcy5zdGRpbi5mZCxidWYsMCxCVUZTSVpFLC0xKTt9Y2F0Y2goZSl7aWYoZS50b1N0cmluZygpLmluY2x1ZGVzKCJFT0YiKSlieXRlc1JlYWQ9MDtlbHNlIHRocm93IGV9aWYoYnl0ZXNSZWFkPjApe3Jlc3VsdD1idWYuc2xpY2UoMCxieXRlc1JlYWQpLnRvU3RyaW5nKCJ1dGYtOCIpO31lbHNlIHtyZXN1bHQ9bnVsbDt9fWVsc2UgaWYodHlwZW9mIHdpbmRvdyE9InVuZGVmaW5lZCImJnR5cGVvZiB3aW5kb3cucHJvbXB0PT0iZnVuY3Rpb24iKXtyZXN1bHQ9d2luZG93LnByb21wdCgiSW5wdXQ6ICIpO2lmKHJlc3VsdCE9PW51bGwpe3Jlc3VsdCs9IlxuIjt9fWVsc2UgaWYodHlwZW9mIHJlYWRsaW5lPT0iZnVuY3Rpb24iKXtyZXN1bHQ9cmVhZGxpbmUoKTtpZihyZXN1bHQhPT1udWxsKXtyZXN1bHQrPSJcbiI7fX1pZighcmVzdWx0KXtyZXR1cm4gbnVsbH10dHkuaW5wdXQ9aW50QXJyYXlGcm9tU3RyaW5nKHJlc3VsdCx0cnVlKTt9cmV0dXJuIHR0eS5pbnB1dC5zaGlmdCgpfSxwdXRfY2hhcjpmdW5jdGlvbih0dHksdmFsKXtpZih2YWw9PT1udWxsfHx2YWw9PT0xMCl7b3V0KFVURjhBcnJheVRvU3RyaW5nKHR0eS5vdXRwdXQsMCkpO3R0eS5vdXRwdXQ9W107fWVsc2Uge2lmKHZhbCE9MCl0dHkub3V0cHV0LnB1c2godmFsKTt9fSxmc3luYzpmdW5jdGlvbih0dHkpe2lmKHR0eS5vdXRwdXQmJnR0eS5vdXRwdXQubGVuZ3RoPjApe291dChVVEY4QXJyYXlUb1N0cmluZyh0dHkub3V0cHV0LDApKTt0dHkub3V0cHV0PVtdO319fSxkZWZhdWx0X3R0eTFfb3BzOntwdXRfY2hhcjpmdW5jdGlvbih0dHksdmFsKXtpZih2YWw9PT1udWxsfHx2YWw9PT0xMCl7ZXJyKFVURjhBcnJheVRvU3RyaW5nKHR0eS5vdXRwdXQsMCkpO3R0eS5vdXRwdXQ9W107fWVsc2Uge2lmKHZhbCE9MCl0dHkub3V0cHV0LnB1c2godmFsKTt9fSxmc3luYzpmdW5jdGlvbih0dHkpe2lmKHR0eS5vdXRwdXQmJnR0eS5vdXRwdXQubGVuZ3RoPjApe2VycihVVEY4QXJyYXlUb1N0cmluZyh0dHkub3V0cHV0LDApKTt0dHkub3V0cHV0PVtdO319fX07ZnVuY3Rpb24gYWxpZ25NZW1vcnkoc2l6ZSxhbGlnbm1lbnQpe3JldHVybiBNYXRoLmNlaWwoc2l6ZS9hbGlnbm1lbnQpKmFsaWdubWVudH1mdW5jdGlvbiBtbWFwQWxsb2Moc2l6ZSl7c2l6ZT1hbGlnbk1lbW9yeShzaXplLDY1NTM2KTt2YXIgcHRyPV9lbXNjcmlwdGVuX2J1aWx0aW5fbWVtYWxpZ24oNjU1MzYsc2l6ZSk7aWYoIXB0cilyZXR1cm4gMDtyZXR1cm4gemVyb01lbW9yeShwdHIsc2l6ZSl9dmFyIE1FTUZTPXtvcHNfdGFibGU6bnVsbCxtb3VudDpmdW5jdGlvbihtb3VudCl7cmV0dXJuIE1FTUZTLmNyZWF0ZU5vZGUobnVsbCwiLyIsMTYzODR8NTExLDApfSxjcmVhdGVOb2RlOmZ1bmN0aW9uKHBhcmVudCxuYW1lLG1vZGUsZGV2KXtpZihGUy5pc0Jsa2Rldihtb2RlKXx8RlMuaXNGSUZPKG1vZGUpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig2Myl9aWYoIU1FTUZTLm9wc190YWJsZSl7TUVNRlMub3BzX3RhYmxlPXtkaXI6e25vZGU6e2dldGF0dHI6TUVNRlMubm9kZV9vcHMuZ2V0YXR0cixzZXRhdHRyOk1FTUZTLm5vZGVfb3BzLnNldGF0dHIsbG9va3VwOk1FTUZTLm5vZGVfb3BzLmxvb2t1cCxta25vZDpNRU1GUy5ub2RlX29wcy5ta25vZCxyZW5hbWU6TUVNRlMubm9kZV9vcHMucmVuYW1lLHVubGluazpNRU1GUy5ub2RlX29wcy51bmxpbmsscm1kaXI6TUVNRlMubm9kZV9vcHMucm1kaXIscmVhZGRpcjpNRU1GUy5ub2RlX29wcy5yZWFkZGlyLHN5bWxpbms6TUVNRlMubm9kZV9vcHMuc3ltbGlua30sc3RyZWFtOntsbHNlZWs6TUVNRlMuc3RyZWFtX29wcy5sbHNlZWt9fSxmaWxlOntub2RlOntnZXRhdHRyOk1FTUZTLm5vZGVfb3BzLmdldGF0dHIsc2V0YXR0cjpNRU1GUy5ub2RlX29wcy5zZXRhdHRyfSxzdHJlYW06e2xsc2VlazpNRU1GUy5zdHJlYW1fb3BzLmxsc2VlayxyZWFkOk1FTUZTLnN0cmVhbV9vcHMucmVhZCx3cml0ZTpNRU1GUy5zdHJlYW1fb3BzLndyaXRlLGFsbG9jYXRlOk1FTUZTLnN0cmVhbV9vcHMuYWxsb2NhdGUsbW1hcDpNRU1GUy5zdHJlYW1fb3BzLm1tYXAsbXN5bmM6TUVNRlMuc3RyZWFtX29wcy5tc3luY319LGxpbms6e25vZGU6e2dldGF0dHI6TUVNRlMubm9kZV9vcHMuZ2V0YXR0cixzZXRhdHRyOk1FTUZTLm5vZGVfb3BzLnNldGF0dHIscmVhZGxpbms6TUVNRlMubm9kZV9vcHMucmVhZGxpbmt9LHN0cmVhbTp7fX0sY2hyZGV2Ontub2RlOntnZXRhdHRyOk1FTUZTLm5vZGVfb3BzLmdldGF0dHIsc2V0YXR0cjpNRU1GUy5ub2RlX29wcy5zZXRhdHRyfSxzdHJlYW06RlMuY2hyZGV2X3N0cmVhbV9vcHN9fTt9dmFyIG5vZGU9RlMuY3JlYXRlTm9kZShwYXJlbnQsbmFtZSxtb2RlLGRldik7aWYoRlMuaXNEaXIobm9kZS5tb2RlKSl7bm9kZS5ub2RlX29wcz1NRU1GUy5vcHNfdGFibGUuZGlyLm5vZGU7bm9kZS5zdHJlYW1fb3BzPU1FTUZTLm9wc190YWJsZS5kaXIuc3RyZWFtO25vZGUuY29udGVudHM9e307fWVsc2UgaWYoRlMuaXNGaWxlKG5vZGUubW9kZSkpe25vZGUubm9kZV9vcHM9TUVNRlMub3BzX3RhYmxlLmZpbGUubm9kZTtub2RlLnN0cmVhbV9vcHM9TUVNRlMub3BzX3RhYmxlLmZpbGUuc3RyZWFtO25vZGUudXNlZEJ5dGVzPTA7bm9kZS5jb250ZW50cz1udWxsO31lbHNlIGlmKEZTLmlzTGluayhub2RlLm1vZGUpKXtub2RlLm5vZGVfb3BzPU1FTUZTLm9wc190YWJsZS5saW5rLm5vZGU7bm9kZS5zdHJlYW1fb3BzPU1FTUZTLm9wc190YWJsZS5saW5rLnN0cmVhbTt9ZWxzZSBpZihGUy5pc0NocmRldihub2RlLm1vZGUpKXtub2RlLm5vZGVfb3BzPU1FTUZTLm9wc190YWJsZS5jaHJkZXYubm9kZTtub2RlLnN0cmVhbV9vcHM9TUVNRlMub3BzX3RhYmxlLmNocmRldi5zdHJlYW07fW5vZGUudGltZXN0YW1wPURhdGUubm93KCk7aWYocGFyZW50KXtwYXJlbnQuY29udGVudHNbbmFtZV09bm9kZTtwYXJlbnQudGltZXN0YW1wPW5vZGUudGltZXN0YW1wO31yZXR1cm4gbm9kZX0sZ2V0RmlsZURhdGFBc1R5cGVkQXJyYXk6ZnVuY3Rpb24obm9kZSl7aWYoIW5vZGUuY29udGVudHMpcmV0dXJuIG5ldyBVaW50OEFycmF5KDApO2lmKG5vZGUuY29udGVudHMuc3ViYXJyYXkpcmV0dXJuIG5vZGUuY29udGVudHMuc3ViYXJyYXkoMCxub2RlLnVzZWRCeXRlcyk7cmV0dXJuIG5ldyBVaW50OEFycmF5KG5vZGUuY29udGVudHMpfSxleHBhbmRGaWxlU3RvcmFnZTpmdW5jdGlvbihub2RlLG5ld0NhcGFjaXR5KXt2YXIgcHJldkNhcGFjaXR5PW5vZGUuY29udGVudHM/bm9kZS5jb250ZW50cy5sZW5ndGg6MDtpZihwcmV2Q2FwYWNpdHk+PW5ld0NhcGFjaXR5KXJldHVybjt2YXIgQ0FQQUNJVFlfRE9VQkxJTkdfTUFYPTEwMjQqMTAyNDtuZXdDYXBhY2l0eT1NYXRoLm1heChuZXdDYXBhY2l0eSxwcmV2Q2FwYWNpdHkqKHByZXZDYXBhY2l0eTxDQVBBQ0lUWV9ET1VCTElOR19NQVg/MjoxLjEyNSk+Pj4wKTtpZihwcmV2Q2FwYWNpdHkhPTApbmV3Q2FwYWNpdHk9TWF0aC5tYXgobmV3Q2FwYWNpdHksMjU2KTt2YXIgb2xkQ29udGVudHM9bm9kZS5jb250ZW50cztub2RlLmNvbnRlbnRzPW5ldyBVaW50OEFycmF5KG5ld0NhcGFjaXR5KTtpZihub2RlLnVzZWRCeXRlcz4wKW5vZGUuY29udGVudHMuc2V0KG9sZENvbnRlbnRzLnN1YmFycmF5KDAsbm9kZS51c2VkQnl0ZXMpLDApO30scmVzaXplRmlsZVN0b3JhZ2U6ZnVuY3Rpb24obm9kZSxuZXdTaXplKXtpZihub2RlLnVzZWRCeXRlcz09bmV3U2l6ZSlyZXR1cm47aWYobmV3U2l6ZT09MCl7bm9kZS5jb250ZW50cz1udWxsO25vZGUudXNlZEJ5dGVzPTA7fWVsc2Uge3ZhciBvbGRDb250ZW50cz1ub2RlLmNvbnRlbnRzO25vZGUuY29udGVudHM9bmV3IFVpbnQ4QXJyYXkobmV3U2l6ZSk7aWYob2xkQ29udGVudHMpe25vZGUuY29udGVudHMuc2V0KG9sZENvbnRlbnRzLnN1YmFycmF5KDAsTWF0aC5taW4obmV3U2l6ZSxub2RlLnVzZWRCeXRlcykpKTt9bm9kZS51c2VkQnl0ZXM9bmV3U2l6ZTt9fSxub2RlX29wczp7Z2V0YXR0cjpmdW5jdGlvbihub2RlKXt2YXIgYXR0cj17fTthdHRyLmRldj1GUy5pc0NocmRldihub2RlLm1vZGUpP25vZGUuaWQ6MTthdHRyLmlubz1ub2RlLmlkO2F0dHIubW9kZT1ub2RlLm1vZGU7YXR0ci5ubGluaz0xO2F0dHIudWlkPTA7YXR0ci5naWQ9MDthdHRyLnJkZXY9bm9kZS5yZGV2O2lmKEZTLmlzRGlyKG5vZGUubW9kZSkpe2F0dHIuc2l6ZT00MDk2O31lbHNlIGlmKEZTLmlzRmlsZShub2RlLm1vZGUpKXthdHRyLnNpemU9bm9kZS51c2VkQnl0ZXM7fWVsc2UgaWYoRlMuaXNMaW5rKG5vZGUubW9kZSkpe2F0dHIuc2l6ZT1ub2RlLmxpbmsubGVuZ3RoO31lbHNlIHthdHRyLnNpemU9MDt9YXR0ci5hdGltZT1uZXcgRGF0ZShub2RlLnRpbWVzdGFtcCk7YXR0ci5tdGltZT1uZXcgRGF0ZShub2RlLnRpbWVzdGFtcCk7YXR0ci5jdGltZT1uZXcgRGF0ZShub2RlLnRpbWVzdGFtcCk7YXR0ci5ibGtzaXplPTQwOTY7YXR0ci5ibG9ja3M9TWF0aC5jZWlsKGF0dHIuc2l6ZS9hdHRyLmJsa3NpemUpO3JldHVybiBhdHRyfSxzZXRhdHRyOmZ1bmN0aW9uKG5vZGUsYXR0cil7aWYoYXR0ci5tb2RlIT09dW5kZWZpbmVkKXtub2RlLm1vZGU9YXR0ci5tb2RlO31pZihhdHRyLnRpbWVzdGFtcCE9PXVuZGVmaW5lZCl7bm9kZS50aW1lc3RhbXA9YXR0ci50aW1lc3RhbXA7fWlmKGF0dHIuc2l6ZSE9PXVuZGVmaW5lZCl7TUVNRlMucmVzaXplRmlsZVN0b3JhZ2Uobm9kZSxhdHRyLnNpemUpO319LGxvb2t1cDpmdW5jdGlvbihwYXJlbnQsbmFtZSl7dGhyb3cgRlMuZ2VuZXJpY0Vycm9yc1s0NF19LG1rbm9kOmZ1bmN0aW9uKHBhcmVudCxuYW1lLG1vZGUsZGV2KXtyZXR1cm4gTUVNRlMuY3JlYXRlTm9kZShwYXJlbnQsbmFtZSxtb2RlLGRldil9LHJlbmFtZTpmdW5jdGlvbihvbGRfbm9kZSxuZXdfZGlyLG5ld19uYW1lKXtpZihGUy5pc0RpcihvbGRfbm9kZS5tb2RlKSl7dmFyIG5ld19ub2RlO3RyeXtuZXdfbm9kZT1GUy5sb29rdXBOb2RlKG5ld19kaXIsbmV3X25hbWUpO31jYXRjaChlKXt9aWYobmV3X25vZGUpe2Zvcih2YXIgaSBpbiBuZXdfbm9kZS5jb250ZW50cyl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNTUpfX19ZGVsZXRlIG9sZF9ub2RlLnBhcmVudC5jb250ZW50c1tvbGRfbm9kZS5uYW1lXTtvbGRfbm9kZS5wYXJlbnQudGltZXN0YW1wPURhdGUubm93KCk7b2xkX25vZGUubmFtZT1uZXdfbmFtZTtuZXdfZGlyLmNvbnRlbnRzW25ld19uYW1lXT1vbGRfbm9kZTtuZXdfZGlyLnRpbWVzdGFtcD1vbGRfbm9kZS5wYXJlbnQudGltZXN0YW1wO29sZF9ub2RlLnBhcmVudD1uZXdfZGlyO30sdW5saW5rOmZ1bmN0aW9uKHBhcmVudCxuYW1lKXtkZWxldGUgcGFyZW50LmNvbnRlbnRzW25hbWVdO3BhcmVudC50aW1lc3RhbXA9RGF0ZS5ub3coKTt9LHJtZGlyOmZ1bmN0aW9uKHBhcmVudCxuYW1lKXt2YXIgbm9kZT1GUy5sb29rdXBOb2RlKHBhcmVudCxuYW1lKTtmb3IodmFyIGkgaW4gbm9kZS5jb250ZW50cyl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNTUpfWRlbGV0ZSBwYXJlbnQuY29udGVudHNbbmFtZV07cGFyZW50LnRpbWVzdGFtcD1EYXRlLm5vdygpO30scmVhZGRpcjpmdW5jdGlvbihub2RlKXt2YXIgZW50cmllcz1bIi4iLCIuLiJdO2Zvcih2YXIga2V5IGluIG5vZGUuY29udGVudHMpe2lmKCFub2RlLmNvbnRlbnRzLmhhc093blByb3BlcnR5KGtleSkpe2NvbnRpbnVlfWVudHJpZXMucHVzaChrZXkpO31yZXR1cm4gZW50cmllc30sc3ltbGluazpmdW5jdGlvbihwYXJlbnQsbmV3bmFtZSxvbGRwYXRoKXt2YXIgbm9kZT1NRU1GUy5jcmVhdGVOb2RlKHBhcmVudCxuZXduYW1lLDUxMXw0MDk2MCwwKTtub2RlLmxpbms9b2xkcGF0aDtyZXR1cm4gbm9kZX0scmVhZGxpbms6ZnVuY3Rpb24obm9kZSl7aWYoIUZTLmlzTGluayhub2RlLm1vZGUpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyOCl9cmV0dXJuIG5vZGUubGlua319LHN0cmVhbV9vcHM6e3JlYWQ6ZnVuY3Rpb24oc3RyZWFtLGJ1ZmZlcixvZmZzZXQsbGVuZ3RoLHBvc2l0aW9uKXt2YXIgY29udGVudHM9c3RyZWFtLm5vZGUuY29udGVudHM7aWYocG9zaXRpb24+PXN0cmVhbS5ub2RlLnVzZWRCeXRlcylyZXR1cm4gMDt2YXIgc2l6ZT1NYXRoLm1pbihzdHJlYW0ubm9kZS51c2VkQnl0ZXMtcG9zaXRpb24sbGVuZ3RoKTtpZihzaXplPjgmJmNvbnRlbnRzLnN1YmFycmF5KXtidWZmZXIuc2V0KGNvbnRlbnRzLnN1YmFycmF5KHBvc2l0aW9uLHBvc2l0aW9uK3NpemUpLG9mZnNldCk7fWVsc2Uge2Zvcih2YXIgaT0wO2k8c2l6ZTtpKyspYnVmZmVyW29mZnNldCtpXT1jb250ZW50c1twb3NpdGlvbitpXTt9cmV0dXJuIHNpemV9LHdyaXRlOmZ1bmN0aW9uKHN0cmVhbSxidWZmZXIsb2Zmc2V0LGxlbmd0aCxwb3NpdGlvbixjYW5Pd24pe2lmKCFsZW5ndGgpcmV0dXJuIDA7dmFyIG5vZGU9c3RyZWFtLm5vZGU7bm9kZS50aW1lc3RhbXA9RGF0ZS5ub3coKTtpZihidWZmZXIuc3ViYXJyYXkmJighbm9kZS5jb250ZW50c3x8bm9kZS5jb250ZW50cy5zdWJhcnJheSkpe2lmKGNhbk93bil7bm9kZS5jb250ZW50cz1idWZmZXIuc3ViYXJyYXkob2Zmc2V0LG9mZnNldCtsZW5ndGgpO25vZGUudXNlZEJ5dGVzPWxlbmd0aDtyZXR1cm4gbGVuZ3RofWVsc2UgaWYobm9kZS51c2VkQnl0ZXM9PT0wJiZwb3NpdGlvbj09PTApe25vZGUuY29udGVudHM9YnVmZmVyLnNsaWNlKG9mZnNldCxvZmZzZXQrbGVuZ3RoKTtub2RlLnVzZWRCeXRlcz1sZW5ndGg7cmV0dXJuIGxlbmd0aH1lbHNlIGlmKHBvc2l0aW9uK2xlbmd0aDw9bm9kZS51c2VkQnl0ZXMpe25vZGUuY29udGVudHMuc2V0KGJ1ZmZlci5zdWJhcnJheShvZmZzZXQsb2Zmc2V0K2xlbmd0aCkscG9zaXRpb24pO3JldHVybiBsZW5ndGh9fU1FTUZTLmV4cGFuZEZpbGVTdG9yYWdlKG5vZGUscG9zaXRpb24rbGVuZ3RoKTtpZihub2RlLmNvbnRlbnRzLnN1YmFycmF5JiZidWZmZXIuc3ViYXJyYXkpe25vZGUuY29udGVudHMuc2V0KGJ1ZmZlci5zdWJhcnJheShvZmZzZXQsb2Zmc2V0K2xlbmd0aCkscG9zaXRpb24pO31lbHNlIHtmb3IodmFyIGk9MDtpPGxlbmd0aDtpKyspe25vZGUuY29udGVudHNbcG9zaXRpb24raV09YnVmZmVyW29mZnNldCtpXTt9fW5vZGUudXNlZEJ5dGVzPU1hdGgubWF4KG5vZGUudXNlZEJ5dGVzLHBvc2l0aW9uK2xlbmd0aCk7cmV0dXJuIGxlbmd0aH0sbGxzZWVrOmZ1bmN0aW9uKHN0cmVhbSxvZmZzZXQsd2hlbmNlKXt2YXIgcG9zaXRpb249b2Zmc2V0O2lmKHdoZW5jZT09PTEpe3Bvc2l0aW9uKz1zdHJlYW0ucG9zaXRpb247fWVsc2UgaWYod2hlbmNlPT09Mil7aWYoRlMuaXNGaWxlKHN0cmVhbS5ub2RlLm1vZGUpKXtwb3NpdGlvbis9c3RyZWFtLm5vZGUudXNlZEJ5dGVzO319aWYocG9zaXRpb248MCl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMjgpfXJldHVybiBwb3NpdGlvbn0sYWxsb2NhdGU6ZnVuY3Rpb24oc3RyZWFtLG9mZnNldCxsZW5ndGgpe01FTUZTLmV4cGFuZEZpbGVTdG9yYWdlKHN0cmVhbS5ub2RlLG9mZnNldCtsZW5ndGgpO3N0cmVhbS5ub2RlLnVzZWRCeXRlcz1NYXRoLm1heChzdHJlYW0ubm9kZS51c2VkQnl0ZXMsb2Zmc2V0K2xlbmd0aCk7fSxtbWFwOmZ1bmN0aW9uKHN0cmVhbSxsZW5ndGgscG9zaXRpb24scHJvdCxmbGFncyl7aWYoIUZTLmlzRmlsZShzdHJlYW0ubm9kZS5tb2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNDMpfXZhciBwdHI7dmFyIGFsbG9jYXRlZDt2YXIgY29udGVudHM9c3RyZWFtLm5vZGUuY29udGVudHM7aWYoIShmbGFncyYyKSYmY29udGVudHMuYnVmZmVyPT09YnVmZmVyKXthbGxvY2F0ZWQ9ZmFsc2U7cHRyPWNvbnRlbnRzLmJ5dGVPZmZzZXQ7fWVsc2Uge2lmKHBvc2l0aW9uPjB8fHBvc2l0aW9uK2xlbmd0aDxjb250ZW50cy5sZW5ndGgpe2lmKGNvbnRlbnRzLnN1YmFycmF5KXtjb250ZW50cz1jb250ZW50cy5zdWJhcnJheShwb3NpdGlvbixwb3NpdGlvbitsZW5ndGgpO31lbHNlIHtjb250ZW50cz1BcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChjb250ZW50cyxwb3NpdGlvbixwb3NpdGlvbitsZW5ndGgpO319YWxsb2NhdGVkPXRydWU7cHRyPW1tYXBBbGxvYyhsZW5ndGgpO2lmKCFwdHIpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDQ4KX1IRUFQOC5zZXQoY29udGVudHMscHRyKTt9cmV0dXJuIHtwdHI6cHRyLGFsbG9jYXRlZDphbGxvY2F0ZWR9fSxtc3luYzpmdW5jdGlvbihzdHJlYW0sYnVmZmVyLG9mZnNldCxsZW5ndGgsbW1hcEZsYWdzKXtNRU1GUy5zdHJlYW1fb3BzLndyaXRlKHN0cmVhbSxidWZmZXIsMCxsZW5ndGgsb2Zmc2V0LGZhbHNlKTtyZXR1cm4gMH19fTtmdW5jdGlvbiBhc3luY0xvYWQodXJsLG9ubG9hZCxvbmVycm9yLG5vUnVuRGVwKXt2YXIgZGVwPSFub1J1bkRlcD9nZXRVbmlxdWVSdW5EZXBlbmRlbmN5KCJhbCAiK3VybCk6IiI7cmVhZEFzeW5jKHVybCxhcnJheUJ1ZmZlcj0+e2Fzc2VydChhcnJheUJ1ZmZlciwnTG9hZGluZyBkYXRhIGZpbGUgIicrdXJsKyciIGZhaWxlZCAobm8gYXJyYXlCdWZmZXIpLicpO29ubG9hZChuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlcikpO2lmKGRlcClyZW1vdmVSdW5EZXBlbmRlbmN5KCk7fSxldmVudD0+e2lmKG9uZXJyb3Ipe29uZXJyb3IoKTt9ZWxzZSB7dGhyb3cgJ0xvYWRpbmcgZGF0YSBmaWxlICInK3VybCsnIiBmYWlsZWQuJ319KTtpZihkZXApYWRkUnVuRGVwZW5kZW5jeSgpO312YXIgRlM9e3Jvb3Q6bnVsbCxtb3VudHM6W10sZGV2aWNlczp7fSxzdHJlYW1zOltdLG5leHRJbm9kZToxLG5hbWVUYWJsZTpudWxsLGN1cnJlbnRQYXRoOiIvIixpbml0aWFsaXplZDpmYWxzZSxpZ25vcmVQZXJtaXNzaW9uczp0cnVlLEVycm5vRXJyb3I6bnVsbCxnZW5lcmljRXJyb3JzOnt9LGZpbGVzeXN0ZW1zOm51bGwsc3luY0ZTUmVxdWVzdHM6MCxsb29rdXBQYXRoOihwYXRoLG9wdHM9e30pPT57cGF0aD1QQVRIX0ZTLnJlc29sdmUocGF0aCk7aWYoIXBhdGgpcmV0dXJuIHtwYXRoOiIiLG5vZGU6bnVsbH07dmFyIGRlZmF1bHRzPXtmb2xsb3dfbW91bnQ6dHJ1ZSxyZWN1cnNlX2NvdW50OjB9O29wdHM9T2JqZWN0LmFzc2lnbihkZWZhdWx0cyxvcHRzKTtpZihvcHRzLnJlY3Vyc2VfY291bnQ+OCl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMzIpfXZhciBwYXJ0cz1wYXRoLnNwbGl0KCIvIikuZmlsdGVyKHA9PiEhcCk7dmFyIGN1cnJlbnQ9RlMucm9vdDt2YXIgY3VycmVudF9wYXRoPSIvIjtmb3IodmFyIGk9MDtpPHBhcnRzLmxlbmd0aDtpKyspe3ZhciBpc2xhc3Q9aT09PXBhcnRzLmxlbmd0aC0xO2lmKGlzbGFzdCYmb3B0cy5wYXJlbnQpe2JyZWFrfWN1cnJlbnQ9RlMubG9va3VwTm9kZShjdXJyZW50LHBhcnRzW2ldKTtjdXJyZW50X3BhdGg9UEFUSC5qb2luMihjdXJyZW50X3BhdGgscGFydHNbaV0pO2lmKEZTLmlzTW91bnRwb2ludChjdXJyZW50KSl7aWYoIWlzbGFzdHx8aXNsYXN0JiZvcHRzLmZvbGxvd19tb3VudCl7Y3VycmVudD1jdXJyZW50Lm1vdW50ZWQucm9vdDt9fWlmKCFpc2xhc3R8fG9wdHMuZm9sbG93KXt2YXIgY291bnQ9MDt3aGlsZShGUy5pc0xpbmsoY3VycmVudC5tb2RlKSl7dmFyIGxpbms9RlMucmVhZGxpbmsoY3VycmVudF9wYXRoKTtjdXJyZW50X3BhdGg9UEFUSF9GUy5yZXNvbHZlKFBBVEguZGlybmFtZShjdXJyZW50X3BhdGgpLGxpbmspO3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChjdXJyZW50X3BhdGgse3JlY3Vyc2VfY291bnQ6b3B0cy5yZWN1cnNlX2NvdW50KzF9KTtjdXJyZW50PWxvb2t1cC5ub2RlO2lmKGNvdW50Kys+NDApe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDMyKX19fX1yZXR1cm4ge3BhdGg6Y3VycmVudF9wYXRoLG5vZGU6Y3VycmVudH19LGdldFBhdGg6bm9kZT0+e3ZhciBwYXRoO3doaWxlKHRydWUpe2lmKEZTLmlzUm9vdChub2RlKSl7dmFyIG1vdW50PW5vZGUubW91bnQubW91bnRwb2ludDtpZighcGF0aClyZXR1cm4gbW91bnQ7cmV0dXJuIG1vdW50W21vdW50Lmxlbmd0aC0xXSE9PSIvIj9tb3VudCsiLyIrcGF0aDptb3VudCtwYXRofXBhdGg9cGF0aD9ub2RlLm5hbWUrIi8iK3BhdGg6bm9kZS5uYW1lO25vZGU9bm9kZS5wYXJlbnQ7fX0saGFzaE5hbWU6KHBhcmVudGlkLG5hbWUpPT57dmFyIGhhc2g9MDtmb3IodmFyIGk9MDtpPG5hbWUubGVuZ3RoO2krKyl7aGFzaD0oaGFzaDw8NSktaGFzaCtuYW1lLmNoYXJDb2RlQXQoaSl8MDt9cmV0dXJuIChwYXJlbnRpZCtoYXNoPj4+MCklRlMubmFtZVRhYmxlLmxlbmd0aH0saGFzaEFkZE5vZGU6bm9kZT0+e3ZhciBoYXNoPUZTLmhhc2hOYW1lKG5vZGUucGFyZW50LmlkLG5vZGUubmFtZSk7bm9kZS5uYW1lX25leHQ9RlMubmFtZVRhYmxlW2hhc2hdO0ZTLm5hbWVUYWJsZVtoYXNoXT1ub2RlO30saGFzaFJlbW92ZU5vZGU6bm9kZT0+e3ZhciBoYXNoPUZTLmhhc2hOYW1lKG5vZGUucGFyZW50LmlkLG5vZGUubmFtZSk7aWYoRlMubmFtZVRhYmxlW2hhc2hdPT09bm9kZSl7RlMubmFtZVRhYmxlW2hhc2hdPW5vZGUubmFtZV9uZXh0O31lbHNlIHt2YXIgY3VycmVudD1GUy5uYW1lVGFibGVbaGFzaF07d2hpbGUoY3VycmVudCl7aWYoY3VycmVudC5uYW1lX25leHQ9PT1ub2RlKXtjdXJyZW50Lm5hbWVfbmV4dD1ub2RlLm5hbWVfbmV4dDticmVha31jdXJyZW50PWN1cnJlbnQubmFtZV9uZXh0O319fSxsb29rdXBOb2RlOihwYXJlbnQsbmFtZSk9Pnt2YXIgZXJyQ29kZT1GUy5tYXlMb29rdXAocGFyZW50KTtpZihlcnJDb2RlKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcihlcnJDb2RlLHBhcmVudCl9dmFyIGhhc2g9RlMuaGFzaE5hbWUocGFyZW50LmlkLG5hbWUpO2Zvcih2YXIgbm9kZT1GUy5uYW1lVGFibGVbaGFzaF07bm9kZTtub2RlPW5vZGUubmFtZV9uZXh0KXt2YXIgbm9kZU5hbWU9bm9kZS5uYW1lO2lmKG5vZGUucGFyZW50LmlkPT09cGFyZW50LmlkJiZub2RlTmFtZT09PW5hbWUpe3JldHVybiBub2RlfX1yZXR1cm4gRlMubG9va3VwKHBhcmVudCxuYW1lKX0sY3JlYXRlTm9kZToocGFyZW50LG5hbWUsbW9kZSxyZGV2KT0+e3ZhciBub2RlPW5ldyBGUy5GU05vZGUocGFyZW50LG5hbWUsbW9kZSxyZGV2KTtGUy5oYXNoQWRkTm9kZShub2RlKTtyZXR1cm4gbm9kZX0sZGVzdHJveU5vZGU6bm9kZT0+e0ZTLmhhc2hSZW1vdmVOb2RlKG5vZGUpO30saXNSb290Om5vZGU9PntyZXR1cm4gbm9kZT09PW5vZGUucGFyZW50fSxpc01vdW50cG9pbnQ6bm9kZT0+e3JldHVybiAhIW5vZGUubW91bnRlZH0saXNGaWxlOm1vZGU9PntyZXR1cm4gKG1vZGUmNjE0NDApPT09MzI3Njh9LGlzRGlyOm1vZGU9PntyZXR1cm4gKG1vZGUmNjE0NDApPT09MTYzODR9LGlzTGluazptb2RlPT57cmV0dXJuIChtb2RlJjYxNDQwKT09PTQwOTYwfSxpc0NocmRldjptb2RlPT57cmV0dXJuIChtb2RlJjYxNDQwKT09PTgxOTJ9LGlzQmxrZGV2Om1vZGU9PntyZXR1cm4gKG1vZGUmNjE0NDApPT09MjQ1NzZ9LGlzRklGTzptb2RlPT57cmV0dXJuIChtb2RlJjYxNDQwKT09PTQwOTZ9LGlzU29ja2V0Om1vZGU9PntyZXR1cm4gKG1vZGUmNDkxNTIpPT09NDkxNTJ9LGZsYWdNb2Rlczp7InIiOjAsInIrIjoyLCJ3Ijo1NzcsIncrIjo1NzgsImEiOjEwODksImErIjoxMDkwfSxtb2RlU3RyaW5nVG9GbGFnczpzdHI9Pnt2YXIgZmxhZ3M9RlMuZmxhZ01vZGVzW3N0cl07aWYodHlwZW9mIGZsYWdzPT0idW5kZWZpbmVkIil7dGhyb3cgbmV3IEVycm9yKCJVbmtub3duIGZpbGUgb3BlbiBtb2RlOiAiK3N0cil9cmV0dXJuIGZsYWdzfSxmbGFnc1RvUGVybWlzc2lvblN0cmluZzpmbGFnPT57dmFyIHBlcm1zPVsiciIsInciLCJydyJdW2ZsYWcmM107aWYoZmxhZyY1MTIpe3Blcm1zKz0idyI7fXJldHVybiBwZXJtc30sbm9kZVBlcm1pc3Npb25zOihub2RlLHBlcm1zKT0+e2lmKEZTLmlnbm9yZVBlcm1pc3Npb25zKXtyZXR1cm4gMH1pZihwZXJtcy5pbmNsdWRlcygiciIpJiYhKG5vZGUubW9kZSYyOTIpKXtyZXR1cm4gMn1lbHNlIGlmKHBlcm1zLmluY2x1ZGVzKCJ3IikmJiEobm9kZS5tb2RlJjE0Nikpe3JldHVybiAyfWVsc2UgaWYocGVybXMuaW5jbHVkZXMoIngiKSYmIShub2RlLm1vZGUmNzMpKXtyZXR1cm4gMn1yZXR1cm4gMH0sbWF5TG9va3VwOmRpcj0+e3ZhciBlcnJDb2RlPUZTLm5vZGVQZXJtaXNzaW9ucyhkaXIsIngiKTtpZihlcnJDb2RlKXJldHVybiBlcnJDb2RlO2lmKCFkaXIubm9kZV9vcHMubG9va3VwKXJldHVybiAyO3JldHVybiAwfSxtYXlDcmVhdGU6KGRpcixuYW1lKT0+e3RyeXt2YXIgbm9kZT1GUy5sb29rdXBOb2RlKGRpcixuYW1lKTtyZXR1cm4gMjB9Y2F0Y2goZSl7fXJldHVybiBGUy5ub2RlUGVybWlzc2lvbnMoZGlyLCJ3eCIpfSxtYXlEZWxldGU6KGRpcixuYW1lLGlzZGlyKT0+e3ZhciBub2RlO3RyeXtub2RlPUZTLmxvb2t1cE5vZGUoZGlyLG5hbWUpO31jYXRjaChlKXtyZXR1cm4gZS5lcnJub312YXIgZXJyQ29kZT1GUy5ub2RlUGVybWlzc2lvbnMoZGlyLCJ3eCIpO2lmKGVyckNvZGUpe3JldHVybiBlcnJDb2RlfWlmKGlzZGlyKXtpZighRlMuaXNEaXIobm9kZS5tb2RlKSl7cmV0dXJuIDU0fWlmKEZTLmlzUm9vdChub2RlKXx8RlMuZ2V0UGF0aChub2RlKT09PUZTLmN3ZCgpKXtyZXR1cm4gMTB9fWVsc2Uge2lmKEZTLmlzRGlyKG5vZGUubW9kZSkpe3JldHVybiAzMX19cmV0dXJuIDB9LG1heU9wZW46KG5vZGUsZmxhZ3MpPT57aWYoIW5vZGUpe3JldHVybiA0NH1pZihGUy5pc0xpbmsobm9kZS5tb2RlKSl7cmV0dXJuIDMyfWVsc2UgaWYoRlMuaXNEaXIobm9kZS5tb2RlKSl7aWYoRlMuZmxhZ3NUb1Blcm1pc3Npb25TdHJpbmcoZmxhZ3MpIT09InIifHxmbGFncyY1MTIpe3JldHVybiAzMX19cmV0dXJuIEZTLm5vZGVQZXJtaXNzaW9ucyhub2RlLEZTLmZsYWdzVG9QZXJtaXNzaW9uU3RyaW5nKGZsYWdzKSl9LE1BWF9PUEVOX0ZEUzo0MDk2LG5leHRmZDooZmRfc3RhcnQ9MCxmZF9lbmQ9RlMuTUFYX09QRU5fRkRTKT0+e2Zvcih2YXIgZmQ9ZmRfc3RhcnQ7ZmQ8PWZkX2VuZDtmZCsrKXtpZighRlMuc3RyZWFtc1tmZF0pe3JldHVybiBmZH19dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMzMpfSxnZXRTdHJlYW06ZmQ9PkZTLnN0cmVhbXNbZmRdLGNyZWF0ZVN0cmVhbTooc3RyZWFtLGZkX3N0YXJ0LGZkX2VuZCk9PntpZighRlMuRlNTdHJlYW0pe0ZTLkZTU3RyZWFtPWZ1bmN0aW9uKCl7dGhpcy5zaGFyZWQ9e307fTtGUy5GU1N0cmVhbS5wcm90b3R5cGU9e307T2JqZWN0LmRlZmluZVByb3BlcnRpZXMoRlMuRlNTdHJlYW0ucHJvdG90eXBlLHtvYmplY3Q6e2dldDpmdW5jdGlvbigpe3JldHVybiB0aGlzLm5vZGV9LHNldDpmdW5jdGlvbih2YWwpe3RoaXMubm9kZT12YWw7fX0saXNSZWFkOntnZXQ6ZnVuY3Rpb24oKXtyZXR1cm4gKHRoaXMuZmxhZ3MmMjA5NzE1NSkhPT0xfX0saXNXcml0ZTp7Z2V0OmZ1bmN0aW9uKCl7cmV0dXJuICh0aGlzLmZsYWdzJjIwOTcxNTUpIT09MH19LGlzQXBwZW5kOntnZXQ6ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5mbGFncyYxMDI0fX0sZmxhZ3M6e2dldDpmdW5jdGlvbigpe3JldHVybiB0aGlzLnNoYXJlZC5mbGFnc30sc2V0OmZ1bmN0aW9uKHZhbCl7dGhpcy5zaGFyZWQuZmxhZ3M9dmFsO319LHBvc2l0aW9uOntnZXQ6ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaGFyZWQucG9zaXRpb259LHNldDpmdW5jdGlvbih2YWwpe3RoaXMuc2hhcmVkLnBvc2l0aW9uPXZhbDt9fX0pO31zdHJlYW09T2JqZWN0LmFzc2lnbihuZXcgRlMuRlNTdHJlYW0sc3RyZWFtKTt2YXIgZmQ9RlMubmV4dGZkKGZkX3N0YXJ0LGZkX2VuZCk7c3RyZWFtLmZkPWZkO0ZTLnN0cmVhbXNbZmRdPXN0cmVhbTtyZXR1cm4gc3RyZWFtfSxjbG9zZVN0cmVhbTpmZD0+e0ZTLnN0cmVhbXNbZmRdPW51bGw7fSxjaHJkZXZfc3RyZWFtX29wczp7b3BlbjpzdHJlYW09Pnt2YXIgZGV2aWNlPUZTLmdldERldmljZShzdHJlYW0ubm9kZS5yZGV2KTtzdHJlYW0uc3RyZWFtX29wcz1kZXZpY2Uuc3RyZWFtX29wcztpZihzdHJlYW0uc3RyZWFtX29wcy5vcGVuKXtzdHJlYW0uc3RyZWFtX29wcy5vcGVuKHN0cmVhbSk7fX0sbGxzZWVrOigpPT57dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNzApfX0sbWFqb3I6ZGV2PT5kZXY+PjgsbWlub3I6ZGV2PT5kZXYmMjU1LG1ha2VkZXY6KG1hLG1pKT0+bWE8PDh8bWkscmVnaXN0ZXJEZXZpY2U6KGRldixvcHMpPT57RlMuZGV2aWNlc1tkZXZdPXtzdHJlYW1fb3BzOm9wc307fSxnZXREZXZpY2U6ZGV2PT5GUy5kZXZpY2VzW2Rldl0sZ2V0TW91bnRzOm1vdW50PT57dmFyIG1vdW50cz1bXTt2YXIgY2hlY2s9W21vdW50XTt3aGlsZShjaGVjay5sZW5ndGgpe3ZhciBtPWNoZWNrLnBvcCgpO21vdW50cy5wdXNoKG0pO2NoZWNrLnB1c2guYXBwbHkoY2hlY2ssbS5tb3VudHMpO31yZXR1cm4gbW91bnRzfSxzeW5jZnM6KHBvcHVsYXRlLGNhbGxiYWNrKT0+e2lmKHR5cGVvZiBwb3B1bGF0ZT09ImZ1bmN0aW9uIil7Y2FsbGJhY2s9cG9wdWxhdGU7cG9wdWxhdGU9ZmFsc2U7fUZTLnN5bmNGU1JlcXVlc3RzKys7aWYoRlMuc3luY0ZTUmVxdWVzdHM+MSl7ZXJyKCJ3YXJuaW5nOiAiK0ZTLnN5bmNGU1JlcXVlc3RzKyIgRlMuc3luY2ZzIG9wZXJhdGlvbnMgaW4gZmxpZ2h0IGF0IG9uY2UsIHByb2JhYmx5IGp1c3QgZG9pbmcgZXh0cmEgd29yayIpO312YXIgbW91bnRzPUZTLmdldE1vdW50cyhGUy5yb290Lm1vdW50KTt2YXIgY29tcGxldGVkPTA7ZnVuY3Rpb24gZG9DYWxsYmFjayhlcnJDb2RlKXtGUy5zeW5jRlNSZXF1ZXN0cy0tO3JldHVybiBjYWxsYmFjayhlcnJDb2RlKX1mdW5jdGlvbiBkb25lKGVyckNvZGUpe2lmKGVyckNvZGUpe2lmKCFkb25lLmVycm9yZWQpe2RvbmUuZXJyb3JlZD10cnVlO3JldHVybiBkb0NhbGxiYWNrKGVyckNvZGUpfXJldHVybn1pZigrK2NvbXBsZXRlZD49bW91bnRzLmxlbmd0aCl7ZG9DYWxsYmFjayhudWxsKTt9fW1vdW50cy5mb3JFYWNoKG1vdW50PT57aWYoIW1vdW50LnR5cGUuc3luY2ZzKXtyZXR1cm4gZG9uZShudWxsKX1tb3VudC50eXBlLnN5bmNmcyhtb3VudCxwb3B1bGF0ZSxkb25lKTt9KTt9LG1vdW50Oih0eXBlLG9wdHMsbW91bnRwb2ludCk9Pnt2YXIgcm9vdD1tb3VudHBvaW50PT09Ii8iO3ZhciBwc2V1ZG89IW1vdW50cG9pbnQ7dmFyIG5vZGU7aWYocm9vdCYmRlMucm9vdCl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMTApfWVsc2UgaWYoIXJvb3QmJiFwc2V1ZG8pe3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChtb3VudHBvaW50LHtmb2xsb3dfbW91bnQ6ZmFsc2V9KTttb3VudHBvaW50PWxvb2t1cC5wYXRoO25vZGU9bG9va3VwLm5vZGU7aWYoRlMuaXNNb3VudHBvaW50KG5vZGUpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigxMCl9aWYoIUZTLmlzRGlyKG5vZGUubW9kZSkpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDU0KX19dmFyIG1vdW50PXt0eXBlOnR5cGUsb3B0czpvcHRzLG1vdW50cG9pbnQ6bW91bnRwb2ludCxtb3VudHM6W119O3ZhciBtb3VudFJvb3Q9dHlwZS5tb3VudChtb3VudCk7bW91bnRSb290Lm1vdW50PW1vdW50O21vdW50LnJvb3Q9bW91bnRSb290O2lmKHJvb3Qpe0ZTLnJvb3Q9bW91bnRSb290O31lbHNlIGlmKG5vZGUpe25vZGUubW91bnRlZD1tb3VudDtpZihub2RlLm1vdW50KXtub2RlLm1vdW50Lm1vdW50cy5wdXNoKG1vdW50KTt9fXJldHVybiBtb3VudFJvb3R9LHVubW91bnQ6bW91bnRwb2ludD0+e3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChtb3VudHBvaW50LHtmb2xsb3dfbW91bnQ6ZmFsc2V9KTtpZighRlMuaXNNb3VudHBvaW50KGxvb2t1cC5ub2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMjgpfXZhciBub2RlPWxvb2t1cC5ub2RlO3ZhciBtb3VudD1ub2RlLm1vdW50ZWQ7dmFyIG1vdW50cz1GUy5nZXRNb3VudHMobW91bnQpO09iamVjdC5rZXlzKEZTLm5hbWVUYWJsZSkuZm9yRWFjaChoYXNoPT57dmFyIGN1cnJlbnQ9RlMubmFtZVRhYmxlW2hhc2hdO3doaWxlKGN1cnJlbnQpe3ZhciBuZXh0PWN1cnJlbnQubmFtZV9uZXh0O2lmKG1vdW50cy5pbmNsdWRlcyhjdXJyZW50Lm1vdW50KSl7RlMuZGVzdHJveU5vZGUoY3VycmVudCk7fWN1cnJlbnQ9bmV4dDt9fSk7bm9kZS5tb3VudGVkPW51bGw7dmFyIGlkeD1ub2RlLm1vdW50Lm1vdW50cy5pbmRleE9mKG1vdW50KTtub2RlLm1vdW50Lm1vdW50cy5zcGxpY2UoaWR4LDEpO30sbG9va3VwOihwYXJlbnQsbmFtZSk9PntyZXR1cm4gcGFyZW50Lm5vZGVfb3BzLmxvb2t1cChwYXJlbnQsbmFtZSl9LG1rbm9kOihwYXRoLG1vZGUsZGV2KT0+e3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChwYXRoLHtwYXJlbnQ6dHJ1ZX0pO3ZhciBwYXJlbnQ9bG9va3VwLm5vZGU7dmFyIG5hbWU9UEFUSC5iYXNlbmFtZShwYXRoKTtpZighbmFtZXx8bmFtZT09PSIuInx8bmFtZT09PSIuLiIpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDI4KX12YXIgZXJyQ29kZT1GUy5tYXlDcmVhdGUocGFyZW50LG5hbWUpO2lmKGVyckNvZGUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKGVyckNvZGUpfWlmKCFwYXJlbnQubm9kZV9vcHMubWtub2Qpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDYzKX1yZXR1cm4gcGFyZW50Lm5vZGVfb3BzLm1rbm9kKHBhcmVudCxuYW1lLG1vZGUsZGV2KX0sY3JlYXRlOihwYXRoLG1vZGUpPT57bW9kZT1tb2RlIT09dW5kZWZpbmVkP21vZGU6NDM4O21vZGUmPTQwOTU7bW9kZXw9MzI3Njg7cmV0dXJuIEZTLm1rbm9kKHBhdGgsbW9kZSwwKX0sbWtkaXI6KHBhdGgsbW9kZSk9Pnttb2RlPW1vZGUhPT11bmRlZmluZWQ/bW9kZTo1MTE7bW9kZSY9NTExfDUxMjttb2RlfD0xNjM4NDtyZXR1cm4gRlMubWtub2QocGF0aCxtb2RlLDApfSxta2RpclRyZWU6KHBhdGgsbW9kZSk9Pnt2YXIgZGlycz1wYXRoLnNwbGl0KCIvIik7dmFyIGQ9IiI7Zm9yKHZhciBpPTA7aTxkaXJzLmxlbmd0aDsrK2kpe2lmKCFkaXJzW2ldKWNvbnRpbnVlO2QrPSIvIitkaXJzW2ldO3RyeXtGUy5ta2RpcihkLG1vZGUpO31jYXRjaChlKXtpZihlLmVycm5vIT0yMCl0aHJvdyBlfX19LG1rZGV2OihwYXRoLG1vZGUsZGV2KT0+e2lmKHR5cGVvZiBkZXY9PSJ1bmRlZmluZWQiKXtkZXY9bW9kZTttb2RlPTQzODt9bW9kZXw9ODE5MjtyZXR1cm4gRlMubWtub2QocGF0aCxtb2RlLGRldil9LHN5bWxpbms6KG9sZHBhdGgsbmV3cGF0aCk9PntpZighUEFUSF9GUy5yZXNvbHZlKG9sZHBhdGgpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig0NCl9dmFyIGxvb2t1cD1GUy5sb29rdXBQYXRoKG5ld3BhdGgse3BhcmVudDp0cnVlfSk7dmFyIHBhcmVudD1sb29rdXAubm9kZTtpZighcGFyZW50KXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig0NCl9dmFyIG5ld25hbWU9UEFUSC5iYXNlbmFtZShuZXdwYXRoKTt2YXIgZXJyQ29kZT1GUy5tYXlDcmVhdGUocGFyZW50LG5ld25hbWUpO2lmKGVyckNvZGUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKGVyckNvZGUpfWlmKCFwYXJlbnQubm9kZV9vcHMuc3ltbGluayl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNjMpfXJldHVybiBwYXJlbnQubm9kZV9vcHMuc3ltbGluayhwYXJlbnQsbmV3bmFtZSxvbGRwYXRoKX0scmVuYW1lOihvbGRfcGF0aCxuZXdfcGF0aCk9Pnt2YXIgb2xkX2Rpcm5hbWU9UEFUSC5kaXJuYW1lKG9sZF9wYXRoKTt2YXIgbmV3X2Rpcm5hbWU9UEFUSC5kaXJuYW1lKG5ld19wYXRoKTt2YXIgb2xkX25hbWU9UEFUSC5iYXNlbmFtZShvbGRfcGF0aCk7dmFyIG5ld19uYW1lPVBBVEguYmFzZW5hbWUobmV3X3BhdGgpO3ZhciBsb29rdXAsb2xkX2RpcixuZXdfZGlyO2xvb2t1cD1GUy5sb29rdXBQYXRoKG9sZF9wYXRoLHtwYXJlbnQ6dHJ1ZX0pO29sZF9kaXI9bG9va3VwLm5vZGU7bG9va3VwPUZTLmxvb2t1cFBhdGgobmV3X3BhdGgse3BhcmVudDp0cnVlfSk7bmV3X2Rpcj1sb29rdXAubm9kZTtpZighb2xkX2Rpcnx8IW5ld19kaXIpdGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNDQpO2lmKG9sZF9kaXIubW91bnQhPT1uZXdfZGlyLm1vdW50KXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig3NSl9dmFyIG9sZF9ub2RlPUZTLmxvb2t1cE5vZGUob2xkX2RpcixvbGRfbmFtZSk7dmFyIHJlbGF0aXZlPVBBVEhfRlMucmVsYXRpdmUob2xkX3BhdGgsbmV3X2Rpcm5hbWUpO2lmKHJlbGF0aXZlLmNoYXJBdCgwKSE9PSIuIil7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMjgpfXJlbGF0aXZlPVBBVEhfRlMucmVsYXRpdmUobmV3X3BhdGgsb2xkX2Rpcm5hbWUpO2lmKHJlbGF0aXZlLmNoYXJBdCgwKSE9PSIuIil7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNTUpfXZhciBuZXdfbm9kZTt0cnl7bmV3X25vZGU9RlMubG9va3VwTm9kZShuZXdfZGlyLG5ld19uYW1lKTt9Y2F0Y2goZSl7fWlmKG9sZF9ub2RlPT09bmV3X25vZGUpe3JldHVybn12YXIgaXNkaXI9RlMuaXNEaXIob2xkX25vZGUubW9kZSk7dmFyIGVyckNvZGU9RlMubWF5RGVsZXRlKG9sZF9kaXIsb2xkX25hbWUsaXNkaXIpO2lmKGVyckNvZGUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKGVyckNvZGUpfWVyckNvZGU9bmV3X25vZGU/RlMubWF5RGVsZXRlKG5ld19kaXIsbmV3X25hbWUsaXNkaXIpOkZTLm1heUNyZWF0ZShuZXdfZGlyLG5ld19uYW1lKTtpZihlcnJDb2RlKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcihlcnJDb2RlKX1pZighb2xkX2Rpci5ub2RlX29wcy5yZW5hbWUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDYzKX1pZihGUy5pc01vdW50cG9pbnQob2xkX25vZGUpfHxuZXdfbm9kZSYmRlMuaXNNb3VudHBvaW50KG5ld19ub2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMTApfWlmKG5ld19kaXIhPT1vbGRfZGlyKXtlcnJDb2RlPUZTLm5vZGVQZXJtaXNzaW9ucyhvbGRfZGlyLCJ3Iik7aWYoZXJyQ29kZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoZXJyQ29kZSl9fUZTLmhhc2hSZW1vdmVOb2RlKG9sZF9ub2RlKTt0cnl7b2xkX2Rpci5ub2RlX29wcy5yZW5hbWUob2xkX25vZGUsbmV3X2RpcixuZXdfbmFtZSk7fWNhdGNoKGUpe3Rocm93IGV9ZmluYWxseXtGUy5oYXNoQWRkTm9kZShvbGRfbm9kZSk7fX0scm1kaXI6cGF0aD0+e3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChwYXRoLHtwYXJlbnQ6dHJ1ZX0pO3ZhciBwYXJlbnQ9bG9va3VwLm5vZGU7dmFyIG5hbWU9UEFUSC5iYXNlbmFtZShwYXRoKTt2YXIgbm9kZT1GUy5sb29rdXBOb2RlKHBhcmVudCxuYW1lKTt2YXIgZXJyQ29kZT1GUy5tYXlEZWxldGUocGFyZW50LG5hbWUsdHJ1ZSk7aWYoZXJyQ29kZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoZXJyQ29kZSl9aWYoIXBhcmVudC5ub2RlX29wcy5ybWRpcil7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNjMpfWlmKEZTLmlzTW91bnRwb2ludChub2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMTApfXBhcmVudC5ub2RlX29wcy5ybWRpcihwYXJlbnQsbmFtZSk7RlMuZGVzdHJveU5vZGUobm9kZSk7fSxyZWFkZGlyOnBhdGg9Pnt2YXIgbG9va3VwPUZTLmxvb2t1cFBhdGgocGF0aCx7Zm9sbG93OnRydWV9KTt2YXIgbm9kZT1sb29rdXAubm9kZTtpZighbm9kZS5ub2RlX29wcy5yZWFkZGlyKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig1NCl9cmV0dXJuIG5vZGUubm9kZV9vcHMucmVhZGRpcihub2RlKX0sdW5saW5rOnBhdGg9Pnt2YXIgbG9va3VwPUZTLmxvb2t1cFBhdGgocGF0aCx7cGFyZW50OnRydWV9KTt2YXIgcGFyZW50PWxvb2t1cC5ub2RlO2lmKCFwYXJlbnQpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDQ0KX12YXIgbmFtZT1QQVRILmJhc2VuYW1lKHBhdGgpO3ZhciBub2RlPUZTLmxvb2t1cE5vZGUocGFyZW50LG5hbWUpO3ZhciBlcnJDb2RlPUZTLm1heURlbGV0ZShwYXJlbnQsbmFtZSxmYWxzZSk7aWYoZXJyQ29kZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoZXJyQ29kZSl9aWYoIXBhcmVudC5ub2RlX29wcy51bmxpbmspe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDYzKX1pZihGUy5pc01vdW50cG9pbnQobm9kZSkpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDEwKX1wYXJlbnQubm9kZV9vcHMudW5saW5rKHBhcmVudCxuYW1lKTtGUy5kZXN0cm95Tm9kZShub2RlKTt9LHJlYWRsaW5rOnBhdGg9Pnt2YXIgbG9va3VwPUZTLmxvb2t1cFBhdGgocGF0aCk7dmFyIGxpbms9bG9va3VwLm5vZGU7aWYoIWxpbmspe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDQ0KX1pZighbGluay5ub2RlX29wcy5yZWFkbGluayl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMjgpfXJldHVybiBQQVRIX0ZTLnJlc29sdmUoRlMuZ2V0UGF0aChsaW5rLnBhcmVudCksbGluay5ub2RlX29wcy5yZWFkbGluayhsaW5rKSl9LHN0YXQ6KHBhdGgsZG9udEZvbGxvdyk9Pnt2YXIgbG9va3VwPUZTLmxvb2t1cFBhdGgocGF0aCx7Zm9sbG93OiFkb250Rm9sbG93fSk7dmFyIG5vZGU9bG9va3VwLm5vZGU7aWYoIW5vZGUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDQ0KX1pZighbm9kZS5ub2RlX29wcy5nZXRhdHRyKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig2Myl9cmV0dXJuIG5vZGUubm9kZV9vcHMuZ2V0YXR0cihub2RlKX0sbHN0YXQ6cGF0aD0+e3JldHVybiBGUy5zdGF0KHBhdGgsdHJ1ZSl9LGNobW9kOihwYXRoLG1vZGUsZG9udEZvbGxvdyk9Pnt2YXIgbm9kZTtpZih0eXBlb2YgcGF0aD09InN0cmluZyIpe3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChwYXRoLHtmb2xsb3c6IWRvbnRGb2xsb3d9KTtub2RlPWxvb2t1cC5ub2RlO31lbHNlIHtub2RlPXBhdGg7fWlmKCFub2RlLm5vZGVfb3BzLnNldGF0dHIpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDYzKX1ub2RlLm5vZGVfb3BzLnNldGF0dHIobm9kZSx7bW9kZTptb2RlJjQwOTV8bm9kZS5tb2RlJn40MDk1LHRpbWVzdGFtcDpEYXRlLm5vdygpfSk7fSxsY2htb2Q6KHBhdGgsbW9kZSk9PntGUy5jaG1vZChwYXRoLG1vZGUsdHJ1ZSk7fSxmY2htb2Q6KGZkLG1vZGUpPT57dmFyIHN0cmVhbT1GUy5nZXRTdHJlYW0oZmQpO2lmKCFzdHJlYW0pe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDgpfUZTLmNobW9kKHN0cmVhbS5ub2RlLG1vZGUpO30sY2hvd246KHBhdGgsdWlkLGdpZCxkb250Rm9sbG93KT0+e3ZhciBub2RlO2lmKHR5cGVvZiBwYXRoPT0ic3RyaW5nIil7dmFyIGxvb2t1cD1GUy5sb29rdXBQYXRoKHBhdGgse2ZvbGxvdzohZG9udEZvbGxvd30pO25vZGU9bG9va3VwLm5vZGU7fWVsc2Uge25vZGU9cGF0aDt9aWYoIW5vZGUubm9kZV9vcHMuc2V0YXR0cil7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNjMpfW5vZGUubm9kZV9vcHMuc2V0YXR0cihub2RlLHt0aW1lc3RhbXA6RGF0ZS5ub3coKX0pO30sbGNob3duOihwYXRoLHVpZCxnaWQpPT57RlMuY2hvd24ocGF0aCx1aWQsZ2lkLHRydWUpO30sZmNob3duOihmZCx1aWQsZ2lkKT0+e3ZhciBzdHJlYW09RlMuZ2V0U3RyZWFtKGZkKTtpZighc3RyZWFtKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig4KX1GUy5jaG93bihzdHJlYW0ubm9kZSx1aWQsZ2lkKTt9LHRydW5jYXRlOihwYXRoLGxlbik9PntpZihsZW48MCl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMjgpfXZhciBub2RlO2lmKHR5cGVvZiBwYXRoPT0ic3RyaW5nIil7dmFyIGxvb2t1cD1GUy5sb29rdXBQYXRoKHBhdGgse2ZvbGxvdzp0cnVlfSk7bm9kZT1sb29rdXAubm9kZTt9ZWxzZSB7bm9kZT1wYXRoO31pZighbm9kZS5ub2RlX29wcy5zZXRhdHRyKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig2Myl9aWYoRlMuaXNEaXIobm9kZS5tb2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMzEpfWlmKCFGUy5pc0ZpbGUobm9kZS5tb2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMjgpfXZhciBlcnJDb2RlPUZTLm5vZGVQZXJtaXNzaW9ucyhub2RlLCJ3Iik7aWYoZXJyQ29kZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoZXJyQ29kZSl9bm9kZS5ub2RlX29wcy5zZXRhdHRyKG5vZGUse3NpemU6bGVuLHRpbWVzdGFtcDpEYXRlLm5vdygpfSk7fSxmdHJ1bmNhdGU6KGZkLGxlbik9Pnt2YXIgc3RyZWFtPUZTLmdldFN0cmVhbShmZCk7aWYoIXN0cmVhbSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoOCl9aWYoKHN0cmVhbS5mbGFncyYyMDk3MTU1KT09PTApe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDI4KX1GUy50cnVuY2F0ZShzdHJlYW0ubm9kZSxsZW4pO30sdXRpbWU6KHBhdGgsYXRpbWUsbXRpbWUpPT57dmFyIGxvb2t1cD1GUy5sb29rdXBQYXRoKHBhdGgse2ZvbGxvdzp0cnVlfSk7dmFyIG5vZGU9bG9va3VwLm5vZGU7bm9kZS5ub2RlX29wcy5zZXRhdHRyKG5vZGUse3RpbWVzdGFtcDpNYXRoLm1heChhdGltZSxtdGltZSl9KTt9LG9wZW46KHBhdGgsZmxhZ3MsbW9kZSk9PntpZihwYXRoPT09IiIpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDQ0KX1mbGFncz10eXBlb2YgZmxhZ3M9PSJzdHJpbmciP0ZTLm1vZGVTdHJpbmdUb0ZsYWdzKGZsYWdzKTpmbGFnczttb2RlPXR5cGVvZiBtb2RlPT0idW5kZWZpbmVkIj80Mzg6bW9kZTtpZihmbGFncyY2NCl7bW9kZT1tb2RlJjQwOTV8MzI3Njg7fWVsc2Uge21vZGU9MDt9dmFyIG5vZGU7aWYodHlwZW9mIHBhdGg9PSJvYmplY3QiKXtub2RlPXBhdGg7fWVsc2Uge3BhdGg9UEFUSC5ub3JtYWxpemUocGF0aCk7dHJ5e3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChwYXRoLHtmb2xsb3c6IShmbGFncyYxMzEwNzIpfSk7bm9kZT1sb29rdXAubm9kZTt9Y2F0Y2goZSl7fX12YXIgY3JlYXRlZD1mYWxzZTtpZihmbGFncyY2NCl7aWYobm9kZSl7aWYoZmxhZ3MmMTI4KXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyMCl9fWVsc2Uge25vZGU9RlMubWtub2QocGF0aCxtb2RlLDApO2NyZWF0ZWQ9dHJ1ZTt9fWlmKCFub2RlKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig0NCl9aWYoRlMuaXNDaHJkZXYobm9kZS5tb2RlKSl7ZmxhZ3MmPX41MTI7fWlmKGZsYWdzJjY1NTM2JiYhRlMuaXNEaXIobm9kZS5tb2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNTQpfWlmKCFjcmVhdGVkKXt2YXIgZXJyQ29kZT1GUy5tYXlPcGVuKG5vZGUsZmxhZ3MpO2lmKGVyckNvZGUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKGVyckNvZGUpfX1pZihmbGFncyY1MTImJiFjcmVhdGVkKXtGUy50cnVuY2F0ZShub2RlLDApO31mbGFncyY9figxMjh8NTEyfDEzMTA3Mik7dmFyIHN0cmVhbT1GUy5jcmVhdGVTdHJlYW0oe25vZGU6bm9kZSxwYXRoOkZTLmdldFBhdGgobm9kZSksZmxhZ3M6ZmxhZ3Msc2Vla2FibGU6dHJ1ZSxwb3NpdGlvbjowLHN0cmVhbV9vcHM6bm9kZS5zdHJlYW1fb3BzLHVuZ290dGVuOltdLGVycm9yOmZhbHNlfSk7aWYoc3RyZWFtLnN0cmVhbV9vcHMub3Blbil7c3RyZWFtLnN0cmVhbV9vcHMub3BlbihzdHJlYW0pO31pZihNb2R1bGVbImxvZ1JlYWRGaWxlcyJdJiYhKGZsYWdzJjEpKXtpZighRlMucmVhZEZpbGVzKUZTLnJlYWRGaWxlcz17fTtpZighKHBhdGggaW4gRlMucmVhZEZpbGVzKSl7RlMucmVhZEZpbGVzW3BhdGhdPTE7fX1yZXR1cm4gc3RyZWFtfSxjbG9zZTpzdHJlYW09PntpZihGUy5pc0Nsb3NlZChzdHJlYW0pKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig4KX1pZihzdHJlYW0uZ2V0ZGVudHMpc3RyZWFtLmdldGRlbnRzPW51bGw7dHJ5e2lmKHN0cmVhbS5zdHJlYW1fb3BzLmNsb3NlKXtzdHJlYW0uc3RyZWFtX29wcy5jbG9zZShzdHJlYW0pO319Y2F0Y2goZSl7dGhyb3cgZX1maW5hbGx5e0ZTLmNsb3NlU3RyZWFtKHN0cmVhbS5mZCk7fXN0cmVhbS5mZD1udWxsO30saXNDbG9zZWQ6c3RyZWFtPT57cmV0dXJuIHN0cmVhbS5mZD09PW51bGx9LGxsc2Vlazooc3RyZWFtLG9mZnNldCx3aGVuY2UpPT57aWYoRlMuaXNDbG9zZWQoc3RyZWFtKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoOCl9aWYoIXN0cmVhbS5zZWVrYWJsZXx8IXN0cmVhbS5zdHJlYW1fb3BzLmxsc2Vlayl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNzApfWlmKHdoZW5jZSE9MCYmd2hlbmNlIT0xJiZ3aGVuY2UhPTIpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDI4KX1zdHJlYW0ucG9zaXRpb249c3RyZWFtLnN0cmVhbV9vcHMubGxzZWVrKHN0cmVhbSxvZmZzZXQsd2hlbmNlKTtzdHJlYW0udW5nb3R0ZW49W107cmV0dXJuIHN0cmVhbS5wb3NpdGlvbn0scmVhZDooc3RyZWFtLGJ1ZmZlcixvZmZzZXQsbGVuZ3RoLHBvc2l0aW9uKT0+e2lmKGxlbmd0aDwwfHxwb3NpdGlvbjwwKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyOCl9aWYoRlMuaXNDbG9zZWQoc3RyZWFtKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoOCl9aWYoKHN0cmVhbS5mbGFncyYyMDk3MTU1KT09PTEpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDgpfWlmKEZTLmlzRGlyKHN0cmVhbS5ub2RlLm1vZGUpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigzMSl9aWYoIXN0cmVhbS5zdHJlYW1fb3BzLnJlYWQpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDI4KX12YXIgc2Vla2luZz10eXBlb2YgcG9zaXRpb24hPSJ1bmRlZmluZWQiO2lmKCFzZWVraW5nKXtwb3NpdGlvbj1zdHJlYW0ucG9zaXRpb247fWVsc2UgaWYoIXN0cmVhbS5zZWVrYWJsZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNzApfXZhciBieXRlc1JlYWQ9c3RyZWFtLnN0cmVhbV9vcHMucmVhZChzdHJlYW0sYnVmZmVyLG9mZnNldCxsZW5ndGgscG9zaXRpb24pO2lmKCFzZWVraW5nKXN0cmVhbS5wb3NpdGlvbis9Ynl0ZXNSZWFkO3JldHVybiBieXRlc1JlYWR9LHdyaXRlOihzdHJlYW0sYnVmZmVyLG9mZnNldCxsZW5ndGgscG9zaXRpb24sY2FuT3duKT0+e2lmKGxlbmd0aDwwfHxwb3NpdGlvbjwwKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyOCl9aWYoRlMuaXNDbG9zZWQoc3RyZWFtKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoOCl9aWYoKHN0cmVhbS5mbGFncyYyMDk3MTU1KT09PTApe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDgpfWlmKEZTLmlzRGlyKHN0cmVhbS5ub2RlLm1vZGUpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigzMSl9aWYoIXN0cmVhbS5zdHJlYW1fb3BzLndyaXRlKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyOCl9aWYoc3RyZWFtLnNlZWthYmxlJiZzdHJlYW0uZmxhZ3MmMTAyNCl7RlMubGxzZWVrKHN0cmVhbSwwLDIpO312YXIgc2Vla2luZz10eXBlb2YgcG9zaXRpb24hPSJ1bmRlZmluZWQiO2lmKCFzZWVraW5nKXtwb3NpdGlvbj1zdHJlYW0ucG9zaXRpb247fWVsc2UgaWYoIXN0cmVhbS5zZWVrYWJsZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNzApfXZhciBieXRlc1dyaXR0ZW49c3RyZWFtLnN0cmVhbV9vcHMud3JpdGUoc3RyZWFtLGJ1ZmZlcixvZmZzZXQsbGVuZ3RoLHBvc2l0aW9uLGNhbk93bik7aWYoIXNlZWtpbmcpc3RyZWFtLnBvc2l0aW9uKz1ieXRlc1dyaXR0ZW47cmV0dXJuIGJ5dGVzV3JpdHRlbn0sYWxsb2NhdGU6KHN0cmVhbSxvZmZzZXQsbGVuZ3RoKT0+e2lmKEZTLmlzQ2xvc2VkKHN0cmVhbSkpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDgpfWlmKG9mZnNldDwwfHxsZW5ndGg8PTApe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDI4KX1pZigoc3RyZWFtLmZsYWdzJjIwOTcxNTUpPT09MCl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoOCl9aWYoIUZTLmlzRmlsZShzdHJlYW0ubm9kZS5tb2RlKSYmIUZTLmlzRGlyKHN0cmVhbS5ub2RlLm1vZGUpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig0Myl9aWYoIXN0cmVhbS5zdHJlYW1fb3BzLmFsbG9jYXRlKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigxMzgpfXN0cmVhbS5zdHJlYW1fb3BzLmFsbG9jYXRlKHN0cmVhbSxvZmZzZXQsbGVuZ3RoKTt9LG1tYXA6KHN0cmVhbSxsZW5ndGgscG9zaXRpb24scHJvdCxmbGFncyk9PntpZigocHJvdCYyKSE9PTAmJihmbGFncyYyKT09PTAmJihzdHJlYW0uZmxhZ3MmMjA5NzE1NSkhPT0yKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyKX1pZigoc3RyZWFtLmZsYWdzJjIwOTcxNTUpPT09MSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMil9aWYoIXN0cmVhbS5zdHJlYW1fb3BzLm1tYXApe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDQzKX1yZXR1cm4gc3RyZWFtLnN0cmVhbV9vcHMubW1hcChzdHJlYW0sbGVuZ3RoLHBvc2l0aW9uLHByb3QsZmxhZ3MpfSxtc3luYzooc3RyZWFtLGJ1ZmZlcixvZmZzZXQsbGVuZ3RoLG1tYXBGbGFncyk9PntpZighc3RyZWFtLnN0cmVhbV9vcHMubXN5bmMpe3JldHVybiAwfXJldHVybiBzdHJlYW0uc3RyZWFtX29wcy5tc3luYyhzdHJlYW0sYnVmZmVyLG9mZnNldCxsZW5ndGgsbW1hcEZsYWdzKX0sbXVubWFwOnN0cmVhbT0+MCxpb2N0bDooc3RyZWFtLGNtZCxhcmcpPT57aWYoIXN0cmVhbS5zdHJlYW1fb3BzLmlvY3RsKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig1OSl9cmV0dXJuIHN0cmVhbS5zdHJlYW1fb3BzLmlvY3RsKHN0cmVhbSxjbWQsYXJnKX0scmVhZEZpbGU6KHBhdGgsb3B0cz17fSk9PntvcHRzLmZsYWdzPW9wdHMuZmxhZ3N8fDA7b3B0cy5lbmNvZGluZz1vcHRzLmVuY29kaW5nfHwiYmluYXJ5IjtpZihvcHRzLmVuY29kaW5nIT09InV0ZjgiJiZvcHRzLmVuY29kaW5nIT09ImJpbmFyeSIpe3Rocm93IG5ldyBFcnJvcignSW52YWxpZCBlbmNvZGluZyB0eXBlICInK29wdHMuZW5jb2RpbmcrJyInKX12YXIgcmV0O3ZhciBzdHJlYW09RlMub3BlbihwYXRoLG9wdHMuZmxhZ3MpO3ZhciBzdGF0PUZTLnN0YXQocGF0aCk7dmFyIGxlbmd0aD1zdGF0LnNpemU7dmFyIGJ1Zj1uZXcgVWludDhBcnJheShsZW5ndGgpO0ZTLnJlYWQoc3RyZWFtLGJ1ZiwwLGxlbmd0aCwwKTtpZihvcHRzLmVuY29kaW5nPT09InV0ZjgiKXtyZXQ9VVRGOEFycmF5VG9TdHJpbmcoYnVmLDApO31lbHNlIGlmKG9wdHMuZW5jb2Rpbmc9PT0iYmluYXJ5Iil7cmV0PWJ1Zjt9RlMuY2xvc2Uoc3RyZWFtKTtyZXR1cm4gcmV0fSx3cml0ZUZpbGU6KHBhdGgsZGF0YSxvcHRzPXt9KT0+e29wdHMuZmxhZ3M9b3B0cy5mbGFnc3x8NTc3O3ZhciBzdHJlYW09RlMub3BlbihwYXRoLG9wdHMuZmxhZ3Msb3B0cy5tb2RlKTtpZih0eXBlb2YgZGF0YT09InN0cmluZyIpe3ZhciBidWY9bmV3IFVpbnQ4QXJyYXkobGVuZ3RoQnl0ZXNVVEY4KGRhdGEpKzEpO3ZhciBhY3R1YWxOdW1CeXRlcz1zdHJpbmdUb1VURjhBcnJheShkYXRhLGJ1ZiwwLGJ1Zi5sZW5ndGgpO0ZTLndyaXRlKHN0cmVhbSxidWYsMCxhY3R1YWxOdW1CeXRlcyx1bmRlZmluZWQsb3B0cy5jYW5Pd24pO31lbHNlIGlmKEFycmF5QnVmZmVyLmlzVmlldyhkYXRhKSl7RlMud3JpdGUoc3RyZWFtLGRhdGEsMCxkYXRhLmJ5dGVMZW5ndGgsdW5kZWZpbmVkLG9wdHMuY2FuT3duKTt9ZWxzZSB7dGhyb3cgbmV3IEVycm9yKCJVbnN1cHBvcnRlZCBkYXRhIHR5cGUiKX1GUy5jbG9zZShzdHJlYW0pO30sY3dkOigpPT5GUy5jdXJyZW50UGF0aCxjaGRpcjpwYXRoPT57dmFyIGxvb2t1cD1GUy5sb29rdXBQYXRoKHBhdGgse2ZvbGxvdzp0cnVlfSk7aWYobG9va3VwLm5vZGU9PT1udWxsKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig0NCl9aWYoIUZTLmlzRGlyKGxvb2t1cC5ub2RlLm1vZGUpKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig1NCl9dmFyIGVyckNvZGU9RlMubm9kZVBlcm1pc3Npb25zKGxvb2t1cC5ub2RlLCJ4Iik7aWYoZXJyQ29kZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoZXJyQ29kZSl9RlMuY3VycmVudFBhdGg9bG9va3VwLnBhdGg7fSxjcmVhdGVEZWZhdWx0RGlyZWN0b3JpZXM6KCk9PntGUy5ta2RpcigiL3RtcCIpO0ZTLm1rZGlyKCIvaG9tZSIpO0ZTLm1rZGlyKCIvaG9tZS93ZWJfdXNlciIpO30sY3JlYXRlRGVmYXVsdERldmljZXM6KCk9PntGUy5ta2RpcigiL2RldiIpO0ZTLnJlZ2lzdGVyRGV2aWNlKEZTLm1ha2VkZXYoMSwzKSx7cmVhZDooKT0+MCx3cml0ZTooc3RyZWFtLGJ1ZmZlcixvZmZzZXQsbGVuZ3RoLHBvcyk9Pmxlbmd0aH0pO0ZTLm1rZGV2KCIvZGV2L251bGwiLEZTLm1ha2VkZXYoMSwzKSk7VFRZLnJlZ2lzdGVyKEZTLm1ha2VkZXYoNSwwKSxUVFkuZGVmYXVsdF90dHlfb3BzKTtUVFkucmVnaXN0ZXIoRlMubWFrZWRldig2LDApLFRUWS5kZWZhdWx0X3R0eTFfb3BzKTtGUy5ta2RldigiL2Rldi90dHkiLEZTLm1ha2VkZXYoNSwwKSk7RlMubWtkZXYoIi9kZXYvdHR5MSIsRlMubWFrZWRldig2LDApKTt2YXIgcmFuZG9tX2RldmljZT1nZXRSYW5kb21EZXZpY2UoKTtGUy5jcmVhdGVEZXZpY2UoIi9kZXYiLCJyYW5kb20iLHJhbmRvbV9kZXZpY2UpO0ZTLmNyZWF0ZURldmljZSgiL2RldiIsInVyYW5kb20iLHJhbmRvbV9kZXZpY2UpO0ZTLm1rZGlyKCIvZGV2L3NobSIpO0ZTLm1rZGlyKCIvZGV2L3NobS90bXAiKTt9LGNyZWF0ZVNwZWNpYWxEaXJlY3RvcmllczooKT0+e0ZTLm1rZGlyKCIvcHJvYyIpO3ZhciBwcm9jX3NlbGY9RlMubWtkaXIoIi9wcm9jL3NlbGYiKTtGUy5ta2RpcigiL3Byb2Mvc2VsZi9mZCIpO0ZTLm1vdW50KHttb3VudDooKT0+e3ZhciBub2RlPUZTLmNyZWF0ZU5vZGUocHJvY19zZWxmLCJmZCIsMTYzODR8NTExLDczKTtub2RlLm5vZGVfb3BzPXtsb29rdXA6KHBhcmVudCxuYW1lKT0+e3ZhciBmZD0rbmFtZTt2YXIgc3RyZWFtPUZTLmdldFN0cmVhbShmZCk7aWYoIXN0cmVhbSl0aHJvdyBuZXcgRlMuRXJybm9FcnJvcig4KTt2YXIgcmV0PXtwYXJlbnQ6bnVsbCxtb3VudDp7bW91bnRwb2ludDoiZmFrZSJ9LG5vZGVfb3BzOntyZWFkbGluazooKT0+c3RyZWFtLnBhdGh9fTtyZXQucGFyZW50PXJldDtyZXR1cm4gcmV0fX07cmV0dXJuIG5vZGV9fSx7fSwiL3Byb2Mvc2VsZi9mZCIpO30sY3JlYXRlU3RhbmRhcmRTdHJlYW1zOigpPT57aWYoTW9kdWxlWyJzdGRpbiJdKXtGUy5jcmVhdGVEZXZpY2UoIi9kZXYiLCJzdGRpbiIsTW9kdWxlWyJzdGRpbiJdKTt9ZWxzZSB7RlMuc3ltbGluaygiL2Rldi90dHkiLCIvZGV2L3N0ZGluIik7fWlmKE1vZHVsZVsic3Rkb3V0Il0pe0ZTLmNyZWF0ZURldmljZSgiL2RldiIsInN0ZG91dCIsbnVsbCxNb2R1bGVbInN0ZG91dCJdKTt9ZWxzZSB7RlMuc3ltbGluaygiL2Rldi90dHkiLCIvZGV2L3N0ZG91dCIpO31pZihNb2R1bGVbInN0ZGVyciJdKXtGUy5jcmVhdGVEZXZpY2UoIi9kZXYiLCJzdGRlcnIiLG51bGwsTW9kdWxlWyJzdGRlcnIiXSk7fWVsc2Uge0ZTLnN5bWxpbmsoIi9kZXYvdHR5MSIsIi9kZXYvc3RkZXJyIik7fUZTLm9wZW4oIi9kZXYvc3RkaW4iLDApO0ZTLm9wZW4oIi9kZXYvc3Rkb3V0IiwxKTtGUy5vcGVuKCIvZGV2L3N0ZGVyciIsMSk7fSxlbnN1cmVFcnJub0Vycm9yOigpPT57aWYoRlMuRXJybm9FcnJvcilyZXR1cm47RlMuRXJybm9FcnJvcj1mdW5jdGlvbiBFcnJub0Vycm9yKGVycm5vLG5vZGUpe3RoaXMubm9kZT1ub2RlO3RoaXMuc2V0RXJybm89ZnVuY3Rpb24oZXJybm8pe3RoaXMuZXJybm89ZXJybm87fTt0aGlzLnNldEVycm5vKGVycm5vKTt0aGlzLm1lc3NhZ2U9IkZTIGVycm9yIjt9O0ZTLkVycm5vRXJyb3IucHJvdG90eXBlPW5ldyBFcnJvcjtGUy5FcnJub0Vycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3Rvcj1GUy5FcnJub0Vycm9yO1s0NF0uZm9yRWFjaChjb2RlPT57RlMuZ2VuZXJpY0Vycm9yc1tjb2RlXT1uZXcgRlMuRXJybm9FcnJvcihjb2RlKTtGUy5nZW5lcmljRXJyb3JzW2NvZGVdLnN0YWNrPSI8Z2VuZXJpYyBlcnJvciwgbm8gc3RhY2s+Ijt9KTt9LHN0YXRpY0luaXQ6KCk9PntGUy5lbnN1cmVFcnJub0Vycm9yKCk7RlMubmFtZVRhYmxlPW5ldyBBcnJheSg0MDk2KTtGUy5tb3VudChNRU1GUyx7fSwiLyIpO0ZTLmNyZWF0ZURlZmF1bHREaXJlY3RvcmllcygpO0ZTLmNyZWF0ZURlZmF1bHREZXZpY2VzKCk7RlMuY3JlYXRlU3BlY2lhbERpcmVjdG9yaWVzKCk7RlMuZmlsZXN5c3RlbXM9eyJNRU1GUyI6TUVNRlN9O30saW5pdDooaW5wdXQsb3V0cHV0LGVycm9yKT0+e0ZTLmluaXQuaW5pdGlhbGl6ZWQ9dHJ1ZTtGUy5lbnN1cmVFcnJub0Vycm9yKCk7TW9kdWxlWyJzdGRpbiJdPWlucHV0fHxNb2R1bGVbInN0ZGluIl07TW9kdWxlWyJzdGRvdXQiXT1vdXRwdXR8fE1vZHVsZVsic3Rkb3V0Il07TW9kdWxlWyJzdGRlcnIiXT1lcnJvcnx8TW9kdWxlWyJzdGRlcnIiXTtGUy5jcmVhdGVTdGFuZGFyZFN0cmVhbXMoKTt9LHF1aXQ6KCk9PntGUy5pbml0LmluaXRpYWxpemVkPWZhbHNlO2Zvcih2YXIgaT0wO2k8RlMuc3RyZWFtcy5sZW5ndGg7aSsrKXt2YXIgc3RyZWFtPUZTLnN0cmVhbXNbaV07aWYoIXN0cmVhbSl7Y29udGludWV9RlMuY2xvc2Uoc3RyZWFtKTt9fSxnZXRNb2RlOihjYW5SZWFkLGNhbldyaXRlKT0+e3ZhciBtb2RlPTA7aWYoY2FuUmVhZCltb2RlfD0yOTJ8NzM7aWYoY2FuV3JpdGUpbW9kZXw9MTQ2O3JldHVybiBtb2RlfSxmaW5kT2JqZWN0OihwYXRoLGRvbnRSZXNvbHZlTGFzdExpbmspPT57dmFyIHJldD1GUy5hbmFseXplUGF0aChwYXRoLGRvbnRSZXNvbHZlTGFzdExpbmspO2lmKCFyZXQuZXhpc3RzKXtyZXR1cm4gbnVsbH1yZXR1cm4gcmV0Lm9iamVjdH0sYW5hbHl6ZVBhdGg6KHBhdGgsZG9udFJlc29sdmVMYXN0TGluayk9Pnt0cnl7dmFyIGxvb2t1cD1GUy5sb29rdXBQYXRoKHBhdGgse2ZvbGxvdzohZG9udFJlc29sdmVMYXN0TGlua30pO3BhdGg9bG9va3VwLnBhdGg7fWNhdGNoKGUpe312YXIgcmV0PXtpc1Jvb3Q6ZmFsc2UsZXhpc3RzOmZhbHNlLGVycm9yOjAsbmFtZTpudWxsLHBhdGg6bnVsbCxvYmplY3Q6bnVsbCxwYXJlbnRFeGlzdHM6ZmFsc2UscGFyZW50UGF0aDpudWxsLHBhcmVudE9iamVjdDpudWxsfTt0cnl7dmFyIGxvb2t1cD1GUy5sb29rdXBQYXRoKHBhdGgse3BhcmVudDp0cnVlfSk7cmV0LnBhcmVudEV4aXN0cz10cnVlO3JldC5wYXJlbnRQYXRoPWxvb2t1cC5wYXRoO3JldC5wYXJlbnRPYmplY3Q9bG9va3VwLm5vZGU7cmV0Lm5hbWU9UEFUSC5iYXNlbmFtZShwYXRoKTtsb29rdXA9RlMubG9va3VwUGF0aChwYXRoLHtmb2xsb3c6IWRvbnRSZXNvbHZlTGFzdExpbmt9KTtyZXQuZXhpc3RzPXRydWU7cmV0LnBhdGg9bG9va3VwLnBhdGg7cmV0Lm9iamVjdD1sb29rdXAubm9kZTtyZXQubmFtZT1sb29rdXAubm9kZS5uYW1lO3JldC5pc1Jvb3Q9bG9va3VwLnBhdGg9PT0iLyI7fWNhdGNoKGUpe3JldC5lcnJvcj1lLmVycm5vO31yZXR1cm4gcmV0fSxjcmVhdGVQYXRoOihwYXJlbnQscGF0aCxjYW5SZWFkLGNhbldyaXRlKT0+e3BhcmVudD10eXBlb2YgcGFyZW50PT0ic3RyaW5nIj9wYXJlbnQ6RlMuZ2V0UGF0aChwYXJlbnQpO3ZhciBwYXJ0cz1wYXRoLnNwbGl0KCIvIikucmV2ZXJzZSgpO3doaWxlKHBhcnRzLmxlbmd0aCl7dmFyIHBhcnQ9cGFydHMucG9wKCk7aWYoIXBhcnQpY29udGludWU7dmFyIGN1cnJlbnQ9UEFUSC5qb2luMihwYXJlbnQscGFydCk7dHJ5e0ZTLm1rZGlyKGN1cnJlbnQpO31jYXRjaChlKXt9cGFyZW50PWN1cnJlbnQ7fXJldHVybiBjdXJyZW50fSxjcmVhdGVGaWxlOihwYXJlbnQsbmFtZSxwcm9wZXJ0aWVzLGNhblJlYWQsY2FuV3JpdGUpPT57dmFyIHBhdGg9UEFUSC5qb2luMih0eXBlb2YgcGFyZW50PT0ic3RyaW5nIj9wYXJlbnQ6RlMuZ2V0UGF0aChwYXJlbnQpLG5hbWUpO3ZhciBtb2RlPUZTLmdldE1vZGUoY2FuUmVhZCxjYW5Xcml0ZSk7cmV0dXJuIEZTLmNyZWF0ZShwYXRoLG1vZGUpfSxjcmVhdGVEYXRhRmlsZToocGFyZW50LG5hbWUsZGF0YSxjYW5SZWFkLGNhbldyaXRlLGNhbk93bik9Pnt2YXIgcGF0aD1uYW1lO2lmKHBhcmVudCl7cGFyZW50PXR5cGVvZiBwYXJlbnQ9PSJzdHJpbmciP3BhcmVudDpGUy5nZXRQYXRoKHBhcmVudCk7cGF0aD1uYW1lP1BBVEguam9pbjIocGFyZW50LG5hbWUpOnBhcmVudDt9dmFyIG1vZGU9RlMuZ2V0TW9kZShjYW5SZWFkLGNhbldyaXRlKTt2YXIgbm9kZT1GUy5jcmVhdGUocGF0aCxtb2RlKTtpZihkYXRhKXtpZih0eXBlb2YgZGF0YT09InN0cmluZyIpe3ZhciBhcnI9bmV3IEFycmF5KGRhdGEubGVuZ3RoKTtmb3IodmFyIGk9MCxsZW49ZGF0YS5sZW5ndGg7aTxsZW47KytpKWFycltpXT1kYXRhLmNoYXJDb2RlQXQoaSk7ZGF0YT1hcnI7fUZTLmNobW9kKG5vZGUsbW9kZXwxNDYpO3ZhciBzdHJlYW09RlMub3Blbihub2RlLDU3Nyk7RlMud3JpdGUoc3RyZWFtLGRhdGEsMCxkYXRhLmxlbmd0aCwwLGNhbk93bik7RlMuY2xvc2Uoc3RyZWFtKTtGUy5jaG1vZChub2RlLG1vZGUpO31yZXR1cm4gbm9kZX0sY3JlYXRlRGV2aWNlOihwYXJlbnQsbmFtZSxpbnB1dCxvdXRwdXQpPT57dmFyIHBhdGg9UEFUSC5qb2luMih0eXBlb2YgcGFyZW50PT0ic3RyaW5nIj9wYXJlbnQ6RlMuZ2V0UGF0aChwYXJlbnQpLG5hbWUpO3ZhciBtb2RlPUZTLmdldE1vZGUoISFpbnB1dCwhIW91dHB1dCk7aWYoIUZTLmNyZWF0ZURldmljZS5tYWpvcilGUy5jcmVhdGVEZXZpY2UubWFqb3I9NjQ7dmFyIGRldj1GUy5tYWtlZGV2KEZTLmNyZWF0ZURldmljZS5tYWpvcisrLDApO0ZTLnJlZ2lzdGVyRGV2aWNlKGRldix7b3BlbjpzdHJlYW09PntzdHJlYW0uc2Vla2FibGU9ZmFsc2U7fSxjbG9zZTpzdHJlYW09PntpZihvdXRwdXQmJm91dHB1dC5idWZmZXImJm91dHB1dC5idWZmZXIubGVuZ3RoKXtvdXRwdXQoMTApO319LHJlYWQ6KHN0cmVhbSxidWZmZXIsb2Zmc2V0LGxlbmd0aCxwb3MpPT57dmFyIGJ5dGVzUmVhZD0wO2Zvcih2YXIgaT0wO2k8bGVuZ3RoO2krKyl7dmFyIHJlc3VsdDt0cnl7cmVzdWx0PWlucHV0KCk7fWNhdGNoKGUpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDI5KX1pZihyZXN1bHQ9PT11bmRlZmluZWQmJmJ5dGVzUmVhZD09PTApe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDYpfWlmKHJlc3VsdD09PW51bGx8fHJlc3VsdD09PXVuZGVmaW5lZClicmVhaztieXRlc1JlYWQrKztidWZmZXJbb2Zmc2V0K2ldPXJlc3VsdDt9aWYoYnl0ZXNSZWFkKXtzdHJlYW0ubm9kZS50aW1lc3RhbXA9RGF0ZS5ub3coKTt9cmV0dXJuIGJ5dGVzUmVhZH0sd3JpdGU6KHN0cmVhbSxidWZmZXIsb2Zmc2V0LGxlbmd0aCxwb3MpPT57Zm9yKHZhciBpPTA7aTxsZW5ndGg7aSsrKXt0cnl7b3V0cHV0KGJ1ZmZlcltvZmZzZXQraV0pO31jYXRjaChlKXt0aHJvdyBuZXcgRlMuRXJybm9FcnJvcigyOSl9fWlmKGxlbmd0aCl7c3RyZWFtLm5vZGUudGltZXN0YW1wPURhdGUubm93KCk7fXJldHVybiBpfX0pO3JldHVybiBGUy5ta2RldihwYXRoLG1vZGUsZGV2KX0sZm9yY2VMb2FkRmlsZTpvYmo9PntpZihvYmouaXNEZXZpY2V8fG9iai5pc0ZvbGRlcnx8b2JqLmxpbmt8fG9iai5jb250ZW50cylyZXR1cm4gdHJ1ZTtpZih0eXBlb2YgWE1MSHR0cFJlcXVlc3QhPSJ1bmRlZmluZWQiKXt0aHJvdyBuZXcgRXJyb3IoIkxhenkgbG9hZGluZyBzaG91bGQgaGF2ZSBiZWVuIHBlcmZvcm1lZCAoY29udGVudHMgc2V0KSBpbiBjcmVhdGVMYXp5RmlsZSwgYnV0IGl0IHdhcyBub3QuIExhenkgbG9hZGluZyBvbmx5IHdvcmtzIGluIHdlYiB3b3JrZXJzLiBVc2UgLS1lbWJlZC1maWxlIG9yIC0tcHJlbG9hZC1maWxlIGluIGVtY2Mgb24gdGhlIG1haW4gdGhyZWFkLiIpfWVsc2UgaWYocmVhZF8pe3RyeXtvYmouY29udGVudHM9aW50QXJyYXlGcm9tU3RyaW5nKHJlYWRfKG9iai51cmwpLHRydWUpO29iai51c2VkQnl0ZXM9b2JqLmNvbnRlbnRzLmxlbmd0aDt9Y2F0Y2goZSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoMjkpfX1lbHNlIHt0aHJvdyBuZXcgRXJyb3IoIkNhbm5vdCBsb2FkIHdpdGhvdXQgcmVhZCgpIG9yIFhNTEh0dHBSZXF1ZXN0LiIpfX0sY3JlYXRlTGF6eUZpbGU6KHBhcmVudCxuYW1lLHVybCxjYW5SZWFkLGNhbldyaXRlKT0+e2Z1bmN0aW9uIExhenlVaW50OEFycmF5KCl7dGhpcy5sZW5ndGhLbm93bj1mYWxzZTt0aGlzLmNodW5rcz1bXTt9TGF6eVVpbnQ4QXJyYXkucHJvdG90eXBlLmdldD1mdW5jdGlvbiBMYXp5VWludDhBcnJheV9nZXQoaWR4KXtpZihpZHg+dGhpcy5sZW5ndGgtMXx8aWR4PDApe3JldHVybiB1bmRlZmluZWR9dmFyIGNodW5rT2Zmc2V0PWlkeCV0aGlzLmNodW5rU2l6ZTt2YXIgY2h1bmtOdW09aWR4L3RoaXMuY2h1bmtTaXplfDA7cmV0dXJuIHRoaXMuZ2V0dGVyKGNodW5rTnVtKVtjaHVua09mZnNldF19O0xhenlVaW50OEFycmF5LnByb3RvdHlwZS5zZXREYXRhR2V0dGVyPWZ1bmN0aW9uIExhenlVaW50OEFycmF5X3NldERhdGFHZXR0ZXIoZ2V0dGVyKXt0aGlzLmdldHRlcj1nZXR0ZXI7fTtMYXp5VWludDhBcnJheS5wcm90b3R5cGUuY2FjaGVMZW5ndGg9ZnVuY3Rpb24gTGF6eVVpbnQ4QXJyYXlfY2FjaGVMZW5ndGgoKXt2YXIgeGhyPW5ldyBYTUxIdHRwUmVxdWVzdDt4aHIub3BlbigiSEVBRCIsdXJsLGZhbHNlKTt4aHIuc2VuZChudWxsKTtpZighKHhoci5zdGF0dXM+PTIwMCYmeGhyLnN0YXR1czwzMDB8fHhoci5zdGF0dXM9PT0zMDQpKXRocm93IG5ldyBFcnJvcigiQ291bGRuJ3QgbG9hZCAiK3VybCsiLiBTdGF0dXM6ICIreGhyLnN0YXR1cyk7dmFyIGRhdGFsZW5ndGg9TnVtYmVyKHhoci5nZXRSZXNwb25zZUhlYWRlcigiQ29udGVudC1sZW5ndGgiKSk7dmFyIGhlYWRlcjt2YXIgaGFzQnl0ZVNlcnZpbmc9KGhlYWRlcj14aHIuZ2V0UmVzcG9uc2VIZWFkZXIoIkFjY2VwdC1SYW5nZXMiKSkmJmhlYWRlcj09PSJieXRlcyI7dmFyIHVzZXNHemlwPShoZWFkZXI9eGhyLmdldFJlc3BvbnNlSGVhZGVyKCJDb250ZW50LUVuY29kaW5nIikpJiZoZWFkZXI9PT0iZ3ppcCI7dmFyIGNodW5rU2l6ZT0xMDI0KjEwMjQ7aWYoIWhhc0J5dGVTZXJ2aW5nKWNodW5rU2l6ZT1kYXRhbGVuZ3RoO3ZhciBkb1hIUj0oZnJvbSx0byk9PntpZihmcm9tPnRvKXRocm93IG5ldyBFcnJvcigiaW52YWxpZCByYW5nZSAoIitmcm9tKyIsICIrdG8rIikgb3Igbm8gYnl0ZXMgcmVxdWVzdGVkISIpO2lmKHRvPmRhdGFsZW5ndGgtMSl0aHJvdyBuZXcgRXJyb3IoIm9ubHkgIitkYXRhbGVuZ3RoKyIgYnl0ZXMgYXZhaWxhYmxlISBwcm9ncmFtbWVyIGVycm9yISIpO3ZhciB4aHI9bmV3IFhNTEh0dHBSZXF1ZXN0O3hoci5vcGVuKCJHRVQiLHVybCxmYWxzZSk7aWYoZGF0YWxlbmd0aCE9PWNodW5rU2l6ZSl4aHIuc2V0UmVxdWVzdEhlYWRlcigiUmFuZ2UiLCJieXRlcz0iK2Zyb20rIi0iK3RvKTt4aHIucmVzcG9uc2VUeXBlPSJhcnJheWJ1ZmZlciI7aWYoeGhyLm92ZXJyaWRlTWltZVR5cGUpe3hoci5vdmVycmlkZU1pbWVUeXBlKCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXgtdXNlci1kZWZpbmVkIik7fXhoci5zZW5kKG51bGwpO2lmKCEoeGhyLnN0YXR1cz49MjAwJiZ4aHIuc3RhdHVzPDMwMHx8eGhyLnN0YXR1cz09PTMwNCkpdGhyb3cgbmV3IEVycm9yKCJDb3VsZG4ndCBsb2FkICIrdXJsKyIuIFN0YXR1czogIit4aHIuc3RhdHVzKTtpZih4aHIucmVzcG9uc2UhPT11bmRlZmluZWQpe3JldHVybiBuZXcgVWludDhBcnJheSh4aHIucmVzcG9uc2V8fFtdKX1yZXR1cm4gaW50QXJyYXlGcm9tU3RyaW5nKHhoci5yZXNwb25zZVRleHR8fCIiLHRydWUpfTt2YXIgbGF6eUFycmF5PXRoaXM7bGF6eUFycmF5LnNldERhdGFHZXR0ZXIoY2h1bmtOdW09Pnt2YXIgc3RhcnQ9Y2h1bmtOdW0qY2h1bmtTaXplO3ZhciBlbmQ9KGNodW5rTnVtKzEpKmNodW5rU2l6ZS0xO2VuZD1NYXRoLm1pbihlbmQsZGF0YWxlbmd0aC0xKTtpZih0eXBlb2YgbGF6eUFycmF5LmNodW5rc1tjaHVua051bV09PSJ1bmRlZmluZWQiKXtsYXp5QXJyYXkuY2h1bmtzW2NodW5rTnVtXT1kb1hIUihzdGFydCxlbmQpO31pZih0eXBlb2YgbGF6eUFycmF5LmNodW5rc1tjaHVua051bV09PSJ1bmRlZmluZWQiKXRocm93IG5ldyBFcnJvcigiZG9YSFIgZmFpbGVkISIpO3JldHVybiBsYXp5QXJyYXkuY2h1bmtzW2NodW5rTnVtXX0pO2lmKHVzZXNHemlwfHwhZGF0YWxlbmd0aCl7Y2h1bmtTaXplPWRhdGFsZW5ndGg9MTtkYXRhbGVuZ3RoPXRoaXMuZ2V0dGVyKDApLmxlbmd0aDtjaHVua1NpemU9ZGF0YWxlbmd0aDtvdXQoIkxhenlGaWxlcyBvbiBnemlwIGZvcmNlcyBkb3dubG9hZCBvZiB0aGUgd2hvbGUgZmlsZSB3aGVuIGxlbmd0aCBpcyBhY2Nlc3NlZCIpO310aGlzLl9sZW5ndGg9ZGF0YWxlbmd0aDt0aGlzLl9jaHVua1NpemU9Y2h1bmtTaXplO3RoaXMubGVuZ3RoS25vd249dHJ1ZTt9O2lmKHR5cGVvZiBYTUxIdHRwUmVxdWVzdCE9InVuZGVmaW5lZCIpe2lmKCFFTlZJUk9OTUVOVF9JU19XT1JLRVIpdGhyb3cgIkNhbm5vdCBkbyBzeW5jaHJvbm91cyBiaW5hcnkgWEhScyBvdXRzaWRlIHdlYndvcmtlcnMgaW4gbW9kZXJuIGJyb3dzZXJzLiBVc2UgLS1lbWJlZC1maWxlIG9yIC0tcHJlbG9hZC1maWxlIGluIGVtY2MiO3ZhciBsYXp5QXJyYXk9bmV3IExhenlVaW50OEFycmF5O09iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGxhenlBcnJheSx7bGVuZ3RoOntnZXQ6ZnVuY3Rpb24oKXtpZighdGhpcy5sZW5ndGhLbm93bil7dGhpcy5jYWNoZUxlbmd0aCgpO31yZXR1cm4gdGhpcy5fbGVuZ3RofX0sY2h1bmtTaXplOntnZXQ6ZnVuY3Rpb24oKXtpZighdGhpcy5sZW5ndGhLbm93bil7dGhpcy5jYWNoZUxlbmd0aCgpO31yZXR1cm4gdGhpcy5fY2h1bmtTaXplfX19KTt2YXIgcHJvcGVydGllcz17aXNEZXZpY2U6ZmFsc2UsY29udGVudHM6bGF6eUFycmF5fTt9ZWxzZSB7dmFyIHByb3BlcnRpZXM9e2lzRGV2aWNlOmZhbHNlLHVybDp1cmx9O312YXIgbm9kZT1GUy5jcmVhdGVGaWxlKHBhcmVudCxuYW1lLHByb3BlcnRpZXMsY2FuUmVhZCxjYW5Xcml0ZSk7aWYocHJvcGVydGllcy5jb250ZW50cyl7bm9kZS5jb250ZW50cz1wcm9wZXJ0aWVzLmNvbnRlbnRzO31lbHNlIGlmKHByb3BlcnRpZXMudXJsKXtub2RlLmNvbnRlbnRzPW51bGw7bm9kZS51cmw9cHJvcGVydGllcy51cmw7fU9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKG5vZGUse3VzZWRCeXRlczp7Z2V0OmZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuY29udGVudHMubGVuZ3RofX19KTt2YXIgc3RyZWFtX29wcz17fTt2YXIga2V5cz1PYmplY3Qua2V5cyhub2RlLnN0cmVhbV9vcHMpO2tleXMuZm9yRWFjaChrZXk9Pnt2YXIgZm49bm9kZS5zdHJlYW1fb3BzW2tleV07c3RyZWFtX29wc1trZXldPWZ1bmN0aW9uIGZvcmNlTG9hZExhenlGaWxlKCl7RlMuZm9yY2VMb2FkRmlsZShub2RlKTtyZXR1cm4gZm4uYXBwbHkobnVsbCxhcmd1bWVudHMpfTt9KTtmdW5jdGlvbiB3cml0ZUNodW5rcyhzdHJlYW0sYnVmZmVyLG9mZnNldCxsZW5ndGgscG9zaXRpb24pe3ZhciBjb250ZW50cz1zdHJlYW0ubm9kZS5jb250ZW50cztpZihwb3NpdGlvbj49Y29udGVudHMubGVuZ3RoKXJldHVybiAwO3ZhciBzaXplPU1hdGgubWluKGNvbnRlbnRzLmxlbmd0aC1wb3NpdGlvbixsZW5ndGgpO2lmKGNvbnRlbnRzLnNsaWNlKXtmb3IodmFyIGk9MDtpPHNpemU7aSsrKXtidWZmZXJbb2Zmc2V0K2ldPWNvbnRlbnRzW3Bvc2l0aW9uK2ldO319ZWxzZSB7Zm9yKHZhciBpPTA7aTxzaXplO2krKyl7YnVmZmVyW29mZnNldCtpXT1jb250ZW50cy5nZXQocG9zaXRpb24raSk7fX1yZXR1cm4gc2l6ZX1zdHJlYW1fb3BzLnJlYWQ9KHN0cmVhbSxidWZmZXIsb2Zmc2V0LGxlbmd0aCxwb3NpdGlvbik9PntGUy5mb3JjZUxvYWRGaWxlKG5vZGUpO3JldHVybiB3cml0ZUNodW5rcyhzdHJlYW0sYnVmZmVyLG9mZnNldCxsZW5ndGgscG9zaXRpb24pfTtzdHJlYW1fb3BzLm1tYXA9KHN0cmVhbSxsZW5ndGgscG9zaXRpb24scHJvdCxmbGFncyk9PntGUy5mb3JjZUxvYWRGaWxlKG5vZGUpO3ZhciBwdHI9bW1hcEFsbG9jKGxlbmd0aCk7aWYoIXB0cil7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNDgpfXdyaXRlQ2h1bmtzKHN0cmVhbSxIRUFQOCxwdHIsbGVuZ3RoLHBvc2l0aW9uKTtyZXR1cm4ge3B0cjpwdHIsYWxsb2NhdGVkOnRydWV9fTtub2RlLnN0cmVhbV9vcHM9c3RyZWFtX29wcztyZXR1cm4gbm9kZX0sY3JlYXRlUHJlbG9hZGVkRmlsZToocGFyZW50LG5hbWUsdXJsLGNhblJlYWQsY2FuV3JpdGUsb25sb2FkLG9uZXJyb3IsZG9udENyZWF0ZUZpbGUsY2FuT3duLHByZUZpbmlzaCk9Pnt2YXIgZnVsbG5hbWU9bmFtZT9QQVRIX0ZTLnJlc29sdmUoUEFUSC5qb2luMihwYXJlbnQsbmFtZSkpOnBhcmVudDtmdW5jdGlvbiBwcm9jZXNzRGF0YShieXRlQXJyYXkpe2Z1bmN0aW9uIGZpbmlzaChieXRlQXJyYXkpe2lmKHByZUZpbmlzaClwcmVGaW5pc2goKTtpZighZG9udENyZWF0ZUZpbGUpe0ZTLmNyZWF0ZURhdGFGaWxlKHBhcmVudCxuYW1lLGJ5dGVBcnJheSxjYW5SZWFkLGNhbldyaXRlLGNhbk93bik7fWlmKG9ubG9hZClvbmxvYWQoKTtyZW1vdmVSdW5EZXBlbmRlbmN5KCk7fWlmKEJyb3dzZXIuaGFuZGxlZEJ5UHJlbG9hZFBsdWdpbihieXRlQXJyYXksZnVsbG5hbWUsZmluaXNoLCgpPT57aWYob25lcnJvcilvbmVycm9yKCk7cmVtb3ZlUnVuRGVwZW5kZW5jeSgpO30pKXtyZXR1cm59ZmluaXNoKGJ5dGVBcnJheSk7fWFkZFJ1bkRlcGVuZGVuY3koKTtpZih0eXBlb2YgdXJsPT0ic3RyaW5nIil7YXN5bmNMb2FkKHVybCxieXRlQXJyYXk9PnByb2Nlc3NEYXRhKGJ5dGVBcnJheSksb25lcnJvcik7fWVsc2Uge3Byb2Nlc3NEYXRhKHVybCk7fX0saW5kZXhlZERCOigpPT57cmV0dXJuIHdpbmRvdy5pbmRleGVkREJ8fHdpbmRvdy5tb3pJbmRleGVkREJ8fHdpbmRvdy53ZWJraXRJbmRleGVkREJ8fHdpbmRvdy5tc0luZGV4ZWREQn0sREJfTkFNRTooKT0+e3JldHVybiAiRU1fRlNfIit3aW5kb3cubG9jYXRpb24ucGF0aG5hbWV9LERCX1ZFUlNJT046MjAsREJfU1RPUkVfTkFNRToiRklMRV9EQVRBIixzYXZlRmlsZXNUb0RCOihwYXRocyxvbmxvYWQsb25lcnJvcik9PntvbmxvYWQ9b25sb2FkfHwoKCk9Pnt9KTtvbmVycm9yPW9uZXJyb3J8fCgoKT0+e30pO3ZhciBpbmRleGVkREI9RlMuaW5kZXhlZERCKCk7dHJ5e3ZhciBvcGVuUmVxdWVzdD1pbmRleGVkREIub3BlbihGUy5EQl9OQU1FKCksRlMuREJfVkVSU0lPTik7fWNhdGNoKGUpe3JldHVybiBvbmVycm9yKGUpfW9wZW5SZXF1ZXN0Lm9udXBncmFkZW5lZWRlZD0oKT0+e291dCgiY3JlYXRpbmcgZGIiKTt2YXIgZGI9b3BlblJlcXVlc3QucmVzdWx0O2RiLmNyZWF0ZU9iamVjdFN0b3JlKEZTLkRCX1NUT1JFX05BTUUpO307b3BlblJlcXVlc3Qub25zdWNjZXNzPSgpPT57dmFyIGRiPW9wZW5SZXF1ZXN0LnJlc3VsdDt2YXIgdHJhbnNhY3Rpb249ZGIudHJhbnNhY3Rpb24oW0ZTLkRCX1NUT1JFX05BTUVdLCJyZWFkd3JpdGUiKTt2YXIgZmlsZXM9dHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoRlMuREJfU1RPUkVfTkFNRSk7dmFyIG9rPTAsZmFpbD0wLHRvdGFsPXBhdGhzLmxlbmd0aDtmdW5jdGlvbiBmaW5pc2goKXtpZihmYWlsPT0wKW9ubG9hZCgpO2Vsc2Ugb25lcnJvcigpO31wYXRocy5mb3JFYWNoKHBhdGg9Pnt2YXIgcHV0UmVxdWVzdD1maWxlcy5wdXQoRlMuYW5hbHl6ZVBhdGgocGF0aCkub2JqZWN0LmNvbnRlbnRzLHBhdGgpO3B1dFJlcXVlc3Qub25zdWNjZXNzPSgpPT57b2srKztpZihvaytmYWlsPT10b3RhbClmaW5pc2goKTt9O3B1dFJlcXVlc3Qub25lcnJvcj0oKT0+e2ZhaWwrKztpZihvaytmYWlsPT10b3RhbClmaW5pc2goKTt9O30pO3RyYW5zYWN0aW9uLm9uZXJyb3I9b25lcnJvcjt9O29wZW5SZXF1ZXN0Lm9uZXJyb3I9b25lcnJvcjt9LGxvYWRGaWxlc0Zyb21EQjoocGF0aHMsb25sb2FkLG9uZXJyb3IpPT57b25sb2FkPW9ubG9hZHx8KCgpPT57fSk7b25lcnJvcj1vbmVycm9yfHwoKCk9Pnt9KTt2YXIgaW5kZXhlZERCPUZTLmluZGV4ZWREQigpO3RyeXt2YXIgb3BlblJlcXVlc3Q9aW5kZXhlZERCLm9wZW4oRlMuREJfTkFNRSgpLEZTLkRCX1ZFUlNJT04pO31jYXRjaChlKXtyZXR1cm4gb25lcnJvcihlKX1vcGVuUmVxdWVzdC5vbnVwZ3JhZGVuZWVkZWQ9b25lcnJvcjtvcGVuUmVxdWVzdC5vbnN1Y2Nlc3M9KCk9Pnt2YXIgZGI9b3BlblJlcXVlc3QucmVzdWx0O3RyeXt2YXIgdHJhbnNhY3Rpb249ZGIudHJhbnNhY3Rpb24oW0ZTLkRCX1NUT1JFX05BTUVdLCJyZWFkb25seSIpO31jYXRjaChlKXtvbmVycm9yKGUpO3JldHVybn12YXIgZmlsZXM9dHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoRlMuREJfU1RPUkVfTkFNRSk7dmFyIG9rPTAsZmFpbD0wLHRvdGFsPXBhdGhzLmxlbmd0aDtmdW5jdGlvbiBmaW5pc2goKXtpZihmYWlsPT0wKW9ubG9hZCgpO2Vsc2Ugb25lcnJvcigpO31wYXRocy5mb3JFYWNoKHBhdGg9Pnt2YXIgZ2V0UmVxdWVzdD1maWxlcy5nZXQocGF0aCk7Z2V0UmVxdWVzdC5vbnN1Y2Nlc3M9KCk9PntpZihGUy5hbmFseXplUGF0aChwYXRoKS5leGlzdHMpe0ZTLnVubGluayhwYXRoKTt9RlMuY3JlYXRlRGF0YUZpbGUoUEFUSC5kaXJuYW1lKHBhdGgpLFBBVEguYmFzZW5hbWUocGF0aCksZ2V0UmVxdWVzdC5yZXN1bHQsdHJ1ZSx0cnVlLHRydWUpO29rKys7aWYob2srZmFpbD09dG90YWwpZmluaXNoKCk7fTtnZXRSZXF1ZXN0Lm9uZXJyb3I9KCk9PntmYWlsKys7aWYob2srZmFpbD09dG90YWwpZmluaXNoKCk7fTt9KTt0cmFuc2FjdGlvbi5vbmVycm9yPW9uZXJyb3I7fTtvcGVuUmVxdWVzdC5vbmVycm9yPW9uZXJyb3I7fX07dmFyIFNZU0NBTExTPXtERUZBVUxUX1BPTExNQVNLOjUsY2FsY3VsYXRlQXQ6ZnVuY3Rpb24oZGlyZmQscGF0aCxhbGxvd0VtcHR5KXtpZihQQVRILmlzQWJzKHBhdGgpKXtyZXR1cm4gcGF0aH12YXIgZGlyO2lmKGRpcmZkPT09LTEwMCl7ZGlyPUZTLmN3ZCgpO31lbHNlIHt2YXIgZGlyc3RyZWFtPVNZU0NBTExTLmdldFN0cmVhbUZyb21GRChkaXJmZCk7ZGlyPWRpcnN0cmVhbS5wYXRoO31pZihwYXRoLmxlbmd0aD09MCl7aWYoIWFsbG93RW1wdHkpe3Rocm93IG5ldyBGUy5FcnJub0Vycm9yKDQ0KX1yZXR1cm4gZGlyfXJldHVybiBQQVRILmpvaW4yKGRpcixwYXRoKX0sZG9TdGF0OmZ1bmN0aW9uKGZ1bmMscGF0aCxidWYpe3RyeXt2YXIgc3RhdD1mdW5jKHBhdGgpO31jYXRjaChlKXtpZihlJiZlLm5vZGUmJlBBVEgubm9ybWFsaXplKHBhdGgpIT09UEFUSC5ub3JtYWxpemUoRlMuZ2V0UGF0aChlLm5vZGUpKSl7cmV0dXJuIC01NH10aHJvdyBlfUhFQVAzMltidWY+PjJdPXN0YXQuZGV2O0hFQVAzMltidWYrOD4+Ml09c3RhdC5pbm87SEVBUDMyW2J1ZisxMj4+Ml09c3RhdC5tb2RlO0hFQVBVMzJbYnVmKzE2Pj4yXT1zdGF0Lm5saW5rO0hFQVAzMltidWYrMjA+PjJdPXN0YXQudWlkO0hFQVAzMltidWYrMjQ+PjJdPXN0YXQuZ2lkO0hFQVAzMltidWYrMjg+PjJdPXN0YXQucmRldjt0ZW1wSTY0PVtzdGF0LnNpemU+Pj4wLCh0ZW1wRG91YmxlPXN0YXQuc2l6ZSwrTWF0aC5hYnModGVtcERvdWJsZSk+PTE/dGVtcERvdWJsZT4wPyhNYXRoLm1pbigrTWF0aC5mbG9vcih0ZW1wRG91YmxlLzQyOTQ5NjcyOTYpLDQyOTQ5NjcyOTUpfDApPj4+MDp+fitNYXRoLmNlaWwoKHRlbXBEb3VibGUtKyh+fnRlbXBEb3VibGU+Pj4wKSkvNDI5NDk2NzI5Nik+Pj4wOjApXSxIRUFQMzJbYnVmKzQwPj4yXT10ZW1wSTY0WzBdLEhFQVAzMltidWYrNDQ+PjJdPXRlbXBJNjRbMV07SEVBUDMyW2J1Zis0OD4+Ml09NDA5NjtIRUFQMzJbYnVmKzUyPj4yXT1zdGF0LmJsb2Nrczt0ZW1wSTY0PVtNYXRoLmZsb29yKHN0YXQuYXRpbWUuZ2V0VGltZSgpLzFlMyk+Pj4wLCh0ZW1wRG91YmxlPU1hdGguZmxvb3Ioc3RhdC5hdGltZS5nZXRUaW1lKCkvMWUzKSwrTWF0aC5hYnModGVtcERvdWJsZSk+PTE/dGVtcERvdWJsZT4wPyhNYXRoLm1pbigrTWF0aC5mbG9vcih0ZW1wRG91YmxlLzQyOTQ5NjcyOTYpLDQyOTQ5NjcyOTUpfDApPj4+MDp+fitNYXRoLmNlaWwoKHRlbXBEb3VibGUtKyh+fnRlbXBEb3VibGU+Pj4wKSkvNDI5NDk2NzI5Nik+Pj4wOjApXSxIRUFQMzJbYnVmKzU2Pj4yXT10ZW1wSTY0WzBdLEhFQVAzMltidWYrNjA+PjJdPXRlbXBJNjRbMV07SEVBUFUzMltidWYrNjQ+PjJdPTA7dGVtcEk2ND1bTWF0aC5mbG9vcihzdGF0Lm10aW1lLmdldFRpbWUoKS8xZTMpPj4+MCwodGVtcERvdWJsZT1NYXRoLmZsb29yKHN0YXQubXRpbWUuZ2V0VGltZSgpLzFlMyksK01hdGguYWJzKHRlbXBEb3VibGUpPj0xP3RlbXBEb3VibGU+MD8oTWF0aC5taW4oK01hdGguZmxvb3IodGVtcERvdWJsZS80Mjk0OTY3Mjk2KSw0Mjk0OTY3Mjk1KXwwKT4+PjA6fn4rTWF0aC5jZWlsKCh0ZW1wRG91YmxlLSsofn50ZW1wRG91YmxlPj4+MCkpLzQyOTQ5NjcyOTYpPj4+MDowKV0sSEVBUDMyW2J1Zis3Mj4+Ml09dGVtcEk2NFswXSxIRUFQMzJbYnVmKzc2Pj4yXT10ZW1wSTY0WzFdO0hFQVBVMzJbYnVmKzgwPj4yXT0wO3RlbXBJNjQ9W01hdGguZmxvb3Ioc3RhdC5jdGltZS5nZXRUaW1lKCkvMWUzKT4+PjAsKHRlbXBEb3VibGU9TWF0aC5mbG9vcihzdGF0LmN0aW1lLmdldFRpbWUoKS8xZTMpLCtNYXRoLmFicyh0ZW1wRG91YmxlKT49MT90ZW1wRG91YmxlPjA/KE1hdGgubWluKCtNYXRoLmZsb29yKHRlbXBEb3VibGUvNDI5NDk2NzI5NiksNDI5NDk2NzI5NSl8MCk+Pj4wOn5+K01hdGguY2VpbCgodGVtcERvdWJsZS0rKH5+dGVtcERvdWJsZT4+PjApKS80Mjk0OTY3Mjk2KT4+PjA6MCldLEhFQVAzMltidWYrODg+PjJdPXRlbXBJNjRbMF0sSEVBUDMyW2J1Zis5Mj4+Ml09dGVtcEk2NFsxXTtIRUFQVTMyW2J1Zis5Nj4+Ml09MDt0ZW1wSTY0PVtzdGF0Lmlubz4+PjAsKHRlbXBEb3VibGU9c3RhdC5pbm8sK01hdGguYWJzKHRlbXBEb3VibGUpPj0xP3RlbXBEb3VibGU+MD8oTWF0aC5taW4oK01hdGguZmxvb3IodGVtcERvdWJsZS80Mjk0OTY3Mjk2KSw0Mjk0OTY3Mjk1KXwwKT4+PjA6fn4rTWF0aC5jZWlsKCh0ZW1wRG91YmxlLSsofn50ZW1wRG91YmxlPj4+MCkpLzQyOTQ5NjcyOTYpPj4+MDowKV0sSEVBUDMyW2J1ZisxMDQ+PjJdPXRlbXBJNjRbMF0sSEVBUDMyW2J1ZisxMDg+PjJdPXRlbXBJNjRbMV07cmV0dXJuIDB9LGRvTXN5bmM6ZnVuY3Rpb24oYWRkcixzdHJlYW0sbGVuLGZsYWdzLG9mZnNldCl7aWYoIUZTLmlzRmlsZShzdHJlYW0ubm9kZS5tb2RlKSl7dGhyb3cgbmV3IEZTLkVycm5vRXJyb3IoNDMpfWlmKGZsYWdzJjIpe3JldHVybiAwfXZhciBidWZmZXI9SEVBUFU4LnNsaWNlKGFkZHIsYWRkcitsZW4pO0ZTLm1zeW5jKHN0cmVhbSxidWZmZXIsb2Zmc2V0LGxlbixmbGFncyk7fSx2YXJhcmdzOnVuZGVmaW5lZCxnZXQ6ZnVuY3Rpb24oKXtTWVNDQUxMUy52YXJhcmdzKz00O3ZhciByZXQ9SEVBUDMyW1NZU0NBTExTLnZhcmFyZ3MtND4+Ml07cmV0dXJuIHJldH0sZ2V0U3RyOmZ1bmN0aW9uKHB0cil7dmFyIHJldD1VVEY4VG9TdHJpbmcocHRyKTtyZXR1cm4gcmV0fSxnZXRTdHJlYW1Gcm9tRkQ6ZnVuY3Rpb24oZmQpe3ZhciBzdHJlYW09RlMuZ2V0U3RyZWFtKGZkKTtpZighc3RyZWFtKXRocm93IG5ldyBGUy5FcnJub0Vycm9yKDgpO3JldHVybiBzdHJlYW19fTtmdW5jdGlvbiBfcHJvY19leGl0KGNvZGUpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDEsMSxjb2RlKTtFWElUU1RBVFVTPWNvZGU7aWYoIWtlZXBSdW50aW1lQWxpdmUoKSl7UFRocmVhZC50ZXJtaW5hdGVBbGxUaHJlYWRzKCk7aWYoTW9kdWxlWyJvbkV4aXQiXSlNb2R1bGVbIm9uRXhpdCJdKGNvZGUpO0FCT1JUPXRydWU7fXF1aXRfKGNvZGUsbmV3IEV4aXRTdGF0dXMoY29kZSkpO31mdW5jdGlvbiBleGl0SlMoc3RhdHVzLGltcGxpY2l0KXtFWElUU1RBVFVTPXN0YXR1cztpZighaW1wbGljaXQpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpe2V4aXRPbk1haW5UaHJlYWQoc3RhdHVzKTt0aHJvdyAidW53aW5kIn19X3Byb2NfZXhpdChzdGF0dXMpO312YXIgX2V4aXQ9ZXhpdEpTO2Z1bmN0aW9uIGhhbmRsZUV4Y2VwdGlvbihlKXtpZihlIGluc3RhbmNlb2YgRXhpdFN0YXR1c3x8ZT09InVud2luZCIpe3JldHVybiBFWElUU1RBVFVTfXF1aXRfKDEsZSk7fXZhciBQVGhyZWFkPXt1bnVzZWRXb3JrZXJzOltdLHJ1bm5pbmdXb3JrZXJzOltdLHRsc0luaXRGdW5jdGlvbnM6W10scHRocmVhZHM6e30saW5pdDpmdW5jdGlvbigpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpe1BUaHJlYWQuaW5pdFdvcmtlcigpO31lbHNlIHtQVGhyZWFkLmluaXRNYWluVGhyZWFkKCk7fX0saW5pdE1haW5UaHJlYWQ6ZnVuY3Rpb24oKXt9LGluaXRXb3JrZXI6ZnVuY3Rpb24oKXtub0V4aXRSdW50aW1lPWZhbHNlO30sc2V0RXhpdFN0YXR1czpmdW5jdGlvbihzdGF0dXMpe0VYSVRTVEFUVVM9c3RhdHVzO30sdGVybWluYXRlQWxsVGhyZWFkczpmdW5jdGlvbigpe2Zvcih2YXIgd29ya2VyIG9mIE9iamVjdC52YWx1ZXMoUFRocmVhZC5wdGhyZWFkcykpe1BUaHJlYWQucmV0dXJuV29ya2VyVG9Qb29sKHdvcmtlcik7fWZvcih2YXIgd29ya2VyIG9mIFBUaHJlYWQudW51c2VkV29ya2Vycyl7d29ya2VyLnRlcm1pbmF0ZSgpO31QVGhyZWFkLnVudXNlZFdvcmtlcnM9W107fSxyZXR1cm5Xb3JrZXJUb1Bvb2w6ZnVuY3Rpb24od29ya2VyKXt2YXIgcHRocmVhZF9wdHI9d29ya2VyLnB0aHJlYWRfcHRyO2RlbGV0ZSBQVGhyZWFkLnB0aHJlYWRzW3B0aHJlYWRfcHRyXTtQVGhyZWFkLnVudXNlZFdvcmtlcnMucHVzaCh3b3JrZXIpO1BUaHJlYWQucnVubmluZ1dvcmtlcnMuc3BsaWNlKFBUaHJlYWQucnVubmluZ1dvcmtlcnMuaW5kZXhPZih3b3JrZXIpLDEpO3dvcmtlci5wdGhyZWFkX3B0cj0wO19fZW1zY3JpcHRlbl90aHJlYWRfZnJlZV9kYXRhKHB0aHJlYWRfcHRyKTt9LHJlY2VpdmVPYmplY3RUcmFuc2ZlcjpmdW5jdGlvbihkYXRhKXt9LHRocmVhZEluaXRUTFM6ZnVuY3Rpb24oKXtQVGhyZWFkLnRsc0luaXRGdW5jdGlvbnMuZm9yRWFjaChmPT5mKCkpO30sbG9hZFdhc21Nb2R1bGVUb1dvcmtlcjpmdW5jdGlvbih3b3JrZXIsb25GaW5pc2hlZExvYWRpbmcpe3dvcmtlci5vbm1lc3NhZ2U9ZT0+e3ZhciBkPWVbImRhdGEiXTt2YXIgY21kPWRbImNtZCJdO2lmKHdvcmtlci5wdGhyZWFkX3B0cilQVGhyZWFkLmN1cnJlbnRQcm94aWVkT3BlcmF0aW9uQ2FsbGVyVGhyZWFkPXdvcmtlci5wdGhyZWFkX3B0cjtpZihkWyJ0YXJnZXRUaHJlYWQiXSYmZFsidGFyZ2V0VGhyZWFkIl0hPV9wdGhyZWFkX3NlbGYoKSl7dmFyIHRhcmdldFdvcmtlcj1QVGhyZWFkLnB0aHJlYWRzW2QudGFyZ2V0VGhyZWFkXTtpZih0YXJnZXRXb3JrZXIpe3RhcmdldFdvcmtlci5wb3N0TWVzc2FnZShkLGRbInRyYW5zZmVyTGlzdCJdKTt9ZWxzZSB7ZXJyKCdJbnRlcm5hbCBlcnJvciEgV29ya2VyIHNlbnQgYSBtZXNzYWdlICInK2NtZCsnIiB0byB0YXJnZXQgcHRocmVhZCAnK2RbInRhcmdldFRocmVhZCJdKyIsIGJ1dCB0aGF0IHRocmVhZCBubyBsb25nZXIgZXhpc3RzISIpO31QVGhyZWFkLmN1cnJlbnRQcm94aWVkT3BlcmF0aW9uQ2FsbGVyVGhyZWFkPXVuZGVmaW5lZDtyZXR1cm59aWYoY21kPT09InByb2Nlc3NQcm94eWluZ1F1ZXVlIil7ZXhlY3V0ZU5vdGlmaWVkUHJveHlpbmdRdWV1ZShkWyJxdWV1ZSJdKTt9ZWxzZSBpZihjbWQ9PT0ic3Bhd25UaHJlYWQiKXtzcGF3blRocmVhZChkKTt9ZWxzZSBpZihjbWQ9PT0iY2xlYW51cFRocmVhZCIpe2NsZWFudXBUaHJlYWQoZFsidGhyZWFkIl0pO31lbHNlIGlmKGNtZD09PSJraWxsVGhyZWFkIil7a2lsbFRocmVhZChkWyJ0aHJlYWQiXSk7fWVsc2UgaWYoY21kPT09ImNhbmNlbFRocmVhZCIpe2NhbmNlbFRocmVhZChkWyJ0aHJlYWQiXSk7fWVsc2UgaWYoY21kPT09ImxvYWRlZCIpe3dvcmtlci5sb2FkZWQ9dHJ1ZTtpZihvbkZpbmlzaGVkTG9hZGluZylvbkZpbmlzaGVkTG9hZGluZyh3b3JrZXIpO2lmKHdvcmtlci5ydW5QdGhyZWFkKXt3b3JrZXIucnVuUHRocmVhZCgpO2RlbGV0ZSB3b3JrZXIucnVuUHRocmVhZDt9fWVsc2UgaWYoY21kPT09InByaW50Iil7b3V0KCJUaHJlYWQgIitkWyJ0aHJlYWRJZCJdKyI6ICIrZFsidGV4dCJdKTt9ZWxzZSBpZihjbWQ9PT0icHJpbnRFcnIiKXtlcnIoIlRocmVhZCAiK2RbInRocmVhZElkIl0rIjogIitkWyJ0ZXh0Il0pO31lbHNlIGlmKGNtZD09PSJhbGVydCIpe2FsZXJ0KCJUaHJlYWQgIitkWyJ0aHJlYWRJZCJdKyI6ICIrZFsidGV4dCJdKTt9ZWxzZSBpZihkLnRhcmdldD09PSJzZXRpbW1lZGlhdGUiKXt3b3JrZXIucG9zdE1lc3NhZ2UoZCk7fWVsc2UgaWYoY21kPT09ImNhbGxIYW5kbGVyIil7TW9kdWxlW2RbImhhbmRsZXIiXV0oLi4uZFsiYXJncyJdKTt9ZWxzZSBpZihjbWQpe2Vycigid29ya2VyIHNlbnQgYW4gdW5rbm93biBjb21tYW5kICIrY21kKTt9UFRocmVhZC5jdXJyZW50UHJveGllZE9wZXJhdGlvbkNhbGxlclRocmVhZD11bmRlZmluZWQ7fTt3b3JrZXIub25lcnJvcj1lPT57dmFyIG1lc3NhZ2U9IndvcmtlciBzZW50IGFuIGVycm9yISI7ZXJyKG1lc3NhZ2UrIiAiK2UuZmlsZW5hbWUrIjoiK2UubGluZW5vKyI6ICIrZS5tZXNzYWdlKTt0aHJvdyBlfTtpZihFTlZJUk9OTUVOVF9JU19OT0RFKXt3b3JrZXIub24oIm1lc3NhZ2UiLGZ1bmN0aW9uKGRhdGEpe3dvcmtlci5vbm1lc3NhZ2Uoe2RhdGE6ZGF0YX0pO30pO3dvcmtlci5vbigiZXJyb3IiLGZ1bmN0aW9uKGUpe3dvcmtlci5vbmVycm9yKGUpO30pO3dvcmtlci5vbigiZGV0YWNoZWRFeGl0IixmdW5jdGlvbigpe30pO312YXIgaGFuZGxlcnM9W107dmFyIGtub3duSGFuZGxlcnM9WyJvbkV4aXQiLCJvbkFib3J0IiwicHJpbnQiLCJwcmludEVyciJdO2Zvcih2YXIgaGFuZGxlciBvZiBrbm93bkhhbmRsZXJzKXtpZihNb2R1bGUuaGFzT3duUHJvcGVydHkoaGFuZGxlcikpe2hhbmRsZXJzLnB1c2goaGFuZGxlcik7fX13b3JrZXIucG9zdE1lc3NhZ2UoeyJjbWQiOiJsb2FkIiwiaGFuZGxlcnMiOmhhbmRsZXJzLCJ1cmxPckJsb2IiOk1vZHVsZVsibWFpblNjcmlwdFVybE9yQmxvYiJdLCJ3YXNtTWVtb3J5Ijp3YXNtTWVtb3J5LCJ3YXNtTW9kdWxlIjp3YXNtTW9kdWxlfSk7fSxhbGxvY2F0ZVVudXNlZFdvcmtlcjpmdW5jdGlvbigpe2lmKCFNb2R1bGVbImxvY2F0ZUZpbGUiXSl7UFRocmVhZC51bnVzZWRXb3JrZXJzLnB1c2gobmV3IFdvcmtlcihuZXcgVVJMKCJseXJhLndvcmtlci5qcyIsKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGxvY2F0aW9uID09PSAndW5kZWZpbmVkJyA/IG5ldyAocmVxdWlyZSgndScgKyAncmwnKS5VUkwpKCdmaWxlOicgKyBfX2ZpbGVuYW1lKS5ocmVmIDogdHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyA/IGxvY2F0aW9uLmhyZWYgOiAoZG9jdW1lbnQuY3VycmVudFNjcmlwdCAmJiBkb2N1bWVudC5jdXJyZW50U2NyaXB0LnNyYyB8fCBuZXcgVVJMKCdseXJhX3N5bmNfd29ya2VyLmpzJywgZG9jdW1lbnQuYmFzZVVSSSkuaHJlZikpKSkpO3JldHVybn12YXIgcHRocmVhZE1haW5Kcz1sb2NhdGVGaWxlKCJseXJhLndvcmtlci5qcyIpO1BUaHJlYWQudW51c2VkV29ya2Vycy5wdXNoKG5ldyBXb3JrZXIocHRocmVhZE1haW5KcykpO30sZ2V0TmV3V29ya2VyOmZ1bmN0aW9uKCl7aWYoUFRocmVhZC51bnVzZWRXb3JrZXJzLmxlbmd0aD09MCl7UFRocmVhZC5hbGxvY2F0ZVVudXNlZFdvcmtlcigpO1BUaHJlYWQubG9hZFdhc21Nb2R1bGVUb1dvcmtlcihQVGhyZWFkLnVudXNlZFdvcmtlcnNbMF0pO31yZXR1cm4gUFRocmVhZC51bnVzZWRXb3JrZXJzLnBvcCgpfX07TW9kdWxlWyJQVGhyZWFkIl09UFRocmVhZDtmdW5jdGlvbiBjYWxsUnVudGltZUNhbGxiYWNrcyhjYWxsYmFja3Mpe3doaWxlKGNhbGxiYWNrcy5sZW5ndGg+MCl7Y2FsbGJhY2tzLnNoaWZ0KCkoTW9kdWxlKTt9fWZ1bmN0aW9uIGVzdGFibGlzaFN0YWNrU3BhY2UoKXt2YXIgcHRocmVhZF9wdHI9X3B0aHJlYWRfc2VsZigpO3ZhciBzdGFja1RvcD1IRUFQMzJbcHRocmVhZF9wdHIrNTI+PjJdO3ZhciBzdGFja1NpemU9SEVBUDMyW3B0aHJlYWRfcHRyKzU2Pj4yXTt2YXIgc3RhY2tNYXg9c3RhY2tUb3Atc3RhY2tTaXplO19lbXNjcmlwdGVuX3N0YWNrX3NldF9saW1pdHMoc3RhY2tUb3Asc3RhY2tNYXgpO3N0YWNrUmVzdG9yZShzdGFja1RvcCk7fU1vZHVsZVsiZXN0YWJsaXNoU3RhY2tTcGFjZSJdPWVzdGFibGlzaFN0YWNrU3BhY2U7ZnVuY3Rpb24gZXhpdE9uTWFpblRocmVhZChyZXR1cm5Db2RlKXtpZihFTlZJUk9OTUVOVF9JU19QVEhSRUFEKXJldHVybiBfZW1zY3JpcHRlbl9wcm94eV90b19tYWluX3RocmVhZF9qcygyLDAscmV0dXJuQ29kZSk7dHJ5e19leGl0KHJldHVybkNvZGUpO31jYXRjaChlKXtoYW5kbGVFeGNlcHRpb24oZSk7fX12YXIgd2FzbVRhYmxlTWlycm9yPVtdO2Z1bmN0aW9uIGdldFdhc21UYWJsZUVudHJ5KGZ1bmNQdHIpe3ZhciBmdW5jPXdhc21UYWJsZU1pcnJvcltmdW5jUHRyXTtpZighZnVuYyl7aWYoZnVuY1B0cj49d2FzbVRhYmxlTWlycm9yLmxlbmd0aCl3YXNtVGFibGVNaXJyb3IubGVuZ3RoPWZ1bmNQdHIrMTt3YXNtVGFibGVNaXJyb3JbZnVuY1B0cl09ZnVuYz13YXNtVGFibGUuZ2V0KGZ1bmNQdHIpO31yZXR1cm4gZnVuY31mdW5jdGlvbiBpbnZva2VFbnRyeVBvaW50KHB0cixhcmcpe3ZhciByZXN1bHQ9Z2V0V2FzbVRhYmxlRW50cnkocHRyKShhcmcpO2lmKGtlZXBSdW50aW1lQWxpdmUoKSl7UFRocmVhZC5zZXRFeGl0U3RhdHVzKHJlc3VsdCk7fWVsc2Uge19fZW1zY3JpcHRlbl90aHJlYWRfZXhpdChyZXN1bHQpO319TW9kdWxlWyJpbnZva2VFbnRyeVBvaW50Il09aW52b2tlRW50cnlQb2ludDtmdW5jdGlvbiByZWdpc3RlclRMU0luaXQodGxzSW5pdEZ1bmMpe1BUaHJlYWQudGxzSW5pdEZ1bmN0aW9ucy5wdXNoKHRsc0luaXRGdW5jKTt9ZnVuY3Rpb24gdHJhdmVyc2VTdGFjayhhcmdzKXtpZighYXJnc3x8IWFyZ3MuY2FsbGVlfHwhYXJncy5jYWxsZWUubmFtZSl7cmV0dXJuIFtudWxsLCIiLCIiXX1hcmdzLmNhbGxlZS50b1N0cmluZygpO3ZhciBmdW5jbmFtZT1hcmdzLmNhbGxlZS5uYW1lO3ZhciBzdHI9IigiO3ZhciBmaXJzdD10cnVlO2Zvcih2YXIgaSBpbiBhcmdzKXt2YXIgYT1hcmdzW2ldO2lmKCFmaXJzdCl7c3RyKz0iLCAiO31maXJzdD1mYWxzZTtpZih0eXBlb2YgYT09Im51bWJlciJ8fHR5cGVvZiBhPT0ic3RyaW5nIil7c3RyKz1hO31lbHNlIHtzdHIrPSIoIit0eXBlb2YgYSsiKSI7fX1zdHIrPSIpIjt2YXIgY2FsbGVyPWFyZ3MuY2FsbGVlLmNhbGxlcjthcmdzPWNhbGxlcj9jYWxsZXIuYXJndW1lbnRzOltdO2lmKGZpcnN0KXN0cj0iIjtyZXR1cm4gW2FyZ3MsZnVuY25hbWUsc3RyXX1mdW5jdGlvbiBqc1N0YWNrVHJhY2UoKXt2YXIgZXJyb3I9bmV3IEVycm9yO2lmKCFlcnJvci5zdGFjayl7dHJ5e3Rocm93IG5ldyBFcnJvcn1jYXRjaChlKXtlcnJvcj1lO31pZighZXJyb3Iuc3RhY2spe3JldHVybiAiKG5vIHN0YWNrIHRyYWNlIGF2YWlsYWJsZSkifX1yZXR1cm4gZXJyb3Iuc3RhY2sudG9TdHJpbmcoKX1mdW5jdGlvbiB3YXJuT25jZSh0ZXh0KXtpZighd2Fybk9uY2Uuc2hvd24pd2Fybk9uY2Uuc2hvd249e307aWYoIXdhcm5PbmNlLnNob3duW3RleHRdKXt3YXJuT25jZS5zaG93blt0ZXh0XT0xO2lmKEVOVklST05NRU5UX0lTX05PREUpdGV4dD0id2FybmluZzogIit0ZXh0O2Vycih0ZXh0KTt9fWZ1bmN0aW9uIF9lbXNjcmlwdGVuX2dldF9jYWxsc3RhY2tfanMoZmxhZ3Mpe3ZhciBjYWxsc3RhY2s9anNTdGFja1RyYWNlKCk7dmFyIGlUaGlzRnVuYz1jYWxsc3RhY2subGFzdEluZGV4T2YoIl9lbXNjcmlwdGVuX2xvZyIpO3ZhciBpVGhpc0Z1bmMyPWNhbGxzdGFjay5sYXN0SW5kZXhPZigiX2Vtc2NyaXB0ZW5fZ2V0X2NhbGxzdGFjayIpO3ZhciBpTmV4dExpbmU9Y2FsbHN0YWNrLmluZGV4T2YoIlxuIixNYXRoLm1heChpVGhpc0Z1bmMsaVRoaXNGdW5jMikpKzE7Y2FsbHN0YWNrPWNhbGxzdGFjay5zbGljZShpTmV4dExpbmUpO2lmKGZsYWdzJjMyKXt3YXJuT25jZSgiRU1fTE9HX0RFTUFOR0xFIGlzIGRlcHJlY2F0ZWQ7IGlnbm9yaW5nIik7fWlmKGZsYWdzJjgmJnR5cGVvZiBlbXNjcmlwdGVuX3NvdXJjZV9tYXA9PSJ1bmRlZmluZWQiKXt3YXJuT25jZSgnU291cmNlIG1hcCBpbmZvcm1hdGlvbiBpcyBub3QgYXZhaWxhYmxlLCBlbXNjcmlwdGVuX2xvZyB3aXRoIEVNX0xPR19DX1NUQUNLIHdpbGwgYmUgaWdub3JlZC4gQnVpbGQgd2l0aCAiLS1wcmUtanMgJEVNU0NSSVBURU4vc3JjL2Vtc2NyaXB0ZW4tc291cmNlLW1hcC5taW4uanMiIGxpbmtlciBmbGFnIHRvIGFkZCBzb3VyY2UgbWFwIGxvYWRpbmcgdG8gY29kZS4nKTtmbGFnc149ODtmbGFnc3w9MTY7fXZhciBzdGFja19hcmdzPW51bGw7aWYoZmxhZ3MmMTI4KXtzdGFja19hcmdzPXRyYXZlcnNlU3RhY2soYXJndW1lbnRzKTt3aGlsZShzdGFja19hcmdzWzFdLmluY2x1ZGVzKCJfZW1zY3JpcHRlbl8iKSlzdGFja19hcmdzPXRyYXZlcnNlU3RhY2soc3RhY2tfYXJnc1swXSk7fXZhciBsaW5lcz1jYWxsc3RhY2suc3BsaXQoIlxuIik7Y2FsbHN0YWNrPSIiO3ZhciBuZXdGaXJlZm94UmU9bmV3IFJlZ0V4cCgiXFxzKiguKj8pQCguKj8pOihbMC05XSspOihbMC05XSspIik7dmFyIGZpcmVmb3hSZT1uZXcgUmVnRXhwKCJcXHMqKC4qPylAKC4qKTooLiopKDooLiopKT8iKTt2YXIgY2hyb21lUmU9bmV3IFJlZ0V4cCgiXFxzKmF0ICguKj8pIFxcKCguKik6KC4qKTooLiopXFwpIik7Zm9yKHZhciBsIGluIGxpbmVzKXt2YXIgbGluZT1saW5lc1tsXTt2YXIgc3ltYm9sTmFtZT0iIjt2YXIgZmlsZT0iIjt2YXIgbGluZW5vPTA7dmFyIGNvbHVtbj0wO3ZhciBwYXJ0cz1jaHJvbWVSZS5leGVjKGxpbmUpO2lmKHBhcnRzJiZwYXJ0cy5sZW5ndGg9PTUpe3N5bWJvbE5hbWU9cGFydHNbMV07ZmlsZT1wYXJ0c1syXTtsaW5lbm89cGFydHNbM107Y29sdW1uPXBhcnRzWzRdO31lbHNlIHtwYXJ0cz1uZXdGaXJlZm94UmUuZXhlYyhsaW5lKTtpZighcGFydHMpcGFydHM9ZmlyZWZveFJlLmV4ZWMobGluZSk7aWYocGFydHMmJnBhcnRzLmxlbmd0aD49NCl7c3ltYm9sTmFtZT1wYXJ0c1sxXTtmaWxlPXBhcnRzWzJdO2xpbmVubz1wYXJ0c1szXTtjb2x1bW49cGFydHNbNF18MDt9ZWxzZSB7Y2FsbHN0YWNrKz1saW5lKyJcbiI7Y29udGludWV9fXZhciBoYXZlU291cmNlTWFwPWZhbHNlO2lmKGZsYWdzJjgpe3ZhciBvcmlnPWVtc2NyaXB0ZW5fc291cmNlX21hcC5vcmlnaW5hbFBvc2l0aW9uRm9yKHtsaW5lOmxpbmVubyxjb2x1bW46Y29sdW1ufSk7aGF2ZVNvdXJjZU1hcD1vcmlnJiZvcmlnLnNvdXJjZTtpZihoYXZlU291cmNlTWFwKXtpZihmbGFncyY2NCl7b3JpZy5zb3VyY2U9b3JpZy5zb3VyY2Uuc3Vic3RyaW5nKG9yaWcuc291cmNlLnJlcGxhY2UoL1xcL2csIi8iKS5sYXN0SW5kZXhPZigiLyIpKzEpO31jYWxsc3RhY2srPSIgICAgYXQgIitzeW1ib2xOYW1lKyIgKCIrb3JpZy5zb3VyY2UrIjoiK29yaWcubGluZSsiOiIrb3JpZy5jb2x1bW4rIilcbiI7fX1pZihmbGFncyYxNnx8IWhhdmVTb3VyY2VNYXApe2lmKGZsYWdzJjY0KXtmaWxlPWZpbGUuc3Vic3RyaW5nKGZpbGUucmVwbGFjZSgvXFwvZywiLyIpLmxhc3RJbmRleE9mKCIvIikrMSk7fWNhbGxzdGFjays9KGhhdmVTb3VyY2VNYXA/IiAgICAgPSAiK3N5bWJvbE5hbWU6IiAgICBhdCAiK3N5bWJvbE5hbWUpKyIgKCIrZmlsZSsiOiIrbGluZW5vKyI6Iitjb2x1bW4rIilcbiI7fWlmKGZsYWdzJjEyOCYmc3RhY2tfYXJnc1swXSl7aWYoc3RhY2tfYXJnc1sxXT09c3ltYm9sTmFtZSYmc3RhY2tfYXJnc1syXS5sZW5ndGg+MCl7Y2FsbHN0YWNrPWNhbGxzdGFjay5yZXBsYWNlKC9ccyskLywiIik7Y2FsbHN0YWNrKz0iIHdpdGggdmFsdWVzOiAiK3N0YWNrX2FyZ3NbMV0rc3RhY2tfYXJnc1syXSsiXG4iO31zdGFja19hcmdzPXRyYXZlcnNlU3RhY2soc3RhY2tfYXJnc1swXSk7fX1jYWxsc3RhY2s9Y2FsbHN0YWNrLnJlcGxhY2UoL1xzKyQvLCIiKTtyZXR1cm4gY2FsbHN0YWNrfWZ1bmN0aW9uIF9fVW53aW5kX0JhY2t0cmFjZShmdW5jLGFyZyl7dmFyIHRyYWNlPV9lbXNjcmlwdGVuX2dldF9jYWxsc3RhY2tfanMoKTt2YXIgcGFydHM9dHJhY2Uuc3BsaXQoIlxuIik7Zm9yKHZhciBpPTA7aTxwYXJ0cy5sZW5ndGg7aSsrKXt2YXIgcmV0PWdldFdhc21UYWJsZUVudHJ5KGZ1bmMpKDAsYXJnKTtpZihyZXQhPT0wKXJldHVybn19ZnVuY3Rpb24gX19VbndpbmRfR2V0SVAoKXtlcnIoIm1pc3NpbmcgZnVuY3Rpb246IF9VbndpbmRfR2V0SVAiKTthYm9ydCgtMSk7fWZ1bmN0aW9uIF9fX2Vtc2NyaXB0ZW5faW5pdF9tYWluX3RocmVhZF9qcyh0Yil7X19lbXNjcmlwdGVuX3RocmVhZF9pbml0KHRiLCFFTlZJUk9OTUVOVF9JU19XT1JLRVIsMSwhRU5WSVJPTk1FTlRfSVNfV0VCKTtQVGhyZWFkLnRocmVhZEluaXRUTFMoKTt9ZnVuY3Rpb24gX19fZW1zY3JpcHRlbl90aHJlYWRfY2xlYW51cCh0aHJlYWQpe2lmKCFFTlZJUk9OTUVOVF9JU19QVEhSRUFEKWNsZWFudXBUaHJlYWQodGhyZWFkKTtlbHNlIHBvc3RNZXNzYWdlKHsiY21kIjoiY2xlYW51cFRocmVhZCIsInRocmVhZCI6dGhyZWFkfSk7fWZ1bmN0aW9uIHB0aHJlYWRDcmVhdGVQcm94aWVkKHB0aHJlYWRfcHRyLGF0dHIsc3RhcnRSb3V0aW5lLGFyZyl7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRClyZXR1cm4gX2Vtc2NyaXB0ZW5fcHJveHlfdG9fbWFpbl90aHJlYWRfanMoMywxLHB0aHJlYWRfcHRyLGF0dHIsc3RhcnRSb3V0aW5lLGFyZyk7cmV0dXJuIF9fX3B0aHJlYWRfY3JlYXRlX2pzKHB0aHJlYWRfcHRyLGF0dHIsc3RhcnRSb3V0aW5lLGFyZyl9ZnVuY3Rpb24gX19fcHRocmVhZF9jcmVhdGVfanMocHRocmVhZF9wdHIsYXR0cixzdGFydFJvdXRpbmUsYXJnKXtpZih0eXBlb2YgU2hhcmVkQXJyYXlCdWZmZXI9PSJ1bmRlZmluZWQiKXtlcnIoIkN1cnJlbnQgZW52aXJvbm1lbnQgZG9lcyBub3Qgc3VwcG9ydCBTaGFyZWRBcnJheUJ1ZmZlciwgcHRocmVhZHMgYXJlIG5vdCBhdmFpbGFibGUhIik7cmV0dXJuIDZ9dmFyIHRyYW5zZmVyTGlzdD1bXTt2YXIgZXJyb3I9MDtpZihFTlZJUk9OTUVOVF9JU19QVEhSRUFEJiYodHJhbnNmZXJMaXN0Lmxlbmd0aD09PTB8fGVycm9yKSl7cmV0dXJuIHB0aHJlYWRDcmVhdGVQcm94aWVkKHB0aHJlYWRfcHRyLGF0dHIsc3RhcnRSb3V0aW5lLGFyZyl9dmFyIHRocmVhZFBhcmFtcz17c3RhcnRSb3V0aW5lOnN0YXJ0Um91dGluZSxwdGhyZWFkX3B0cjpwdGhyZWFkX3B0cixhcmc6YXJnLHRyYW5zZmVyTGlzdDp0cmFuc2Zlckxpc3R9O2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpe3RocmVhZFBhcmFtcy5jbWQ9InNwYXduVGhyZWFkIjtwb3N0TWVzc2FnZSh0aHJlYWRQYXJhbXMsdHJhbnNmZXJMaXN0KTtyZXR1cm4gMH1yZXR1cm4gc3Bhd25UaHJlYWQodGhyZWFkUGFyYW1zKX1mdW5jdGlvbiBzZXRFcnJObyh2YWx1ZSl7SEVBUDMyW19fX2Vycm5vX2xvY2F0aW9uKCk+PjJdPXZhbHVlO3JldHVybiB2YWx1ZX1mdW5jdGlvbiBfX19zeXNjYWxsX2ZjbnRsNjQoZmQsY21kLHZhcmFyZ3Mpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDQsMSxmZCxjbWQsdmFyYXJncyk7U1lTQ0FMTFMudmFyYXJncz12YXJhcmdzO3RyeXt2YXIgc3RyZWFtPVNZU0NBTExTLmdldFN0cmVhbUZyb21GRChmZCk7c3dpdGNoKGNtZCl7Y2FzZSAwOnt2YXIgYXJnPVNZU0NBTExTLmdldCgpO2lmKGFyZzwwKXtyZXR1cm4gLTI4fXZhciBuZXdTdHJlYW07bmV3U3RyZWFtPUZTLmNyZWF0ZVN0cmVhbShzdHJlYW0sYXJnKTtyZXR1cm4gbmV3U3RyZWFtLmZkfWNhc2UgMTpjYXNlIDI6cmV0dXJuIDA7Y2FzZSAzOnJldHVybiBzdHJlYW0uZmxhZ3M7Y2FzZSA0Ont2YXIgYXJnPVNZU0NBTExTLmdldCgpO3N0cmVhbS5mbGFnc3w9YXJnO3JldHVybiAwfWNhc2UgNTp7dmFyIGFyZz1TWVNDQUxMUy5nZXQoKTt2YXIgb2Zmc2V0PTA7SEVBUDE2W2FyZytvZmZzZXQ+PjFdPTI7cmV0dXJuIDB9Y2FzZSA2OmNhc2UgNzpyZXR1cm4gMDtjYXNlIDE2OmNhc2UgODpyZXR1cm4gLTI4O2Nhc2UgOTpzZXRFcnJObygyOCk7cmV0dXJuIC0xO2RlZmF1bHQ6e3JldHVybiAtMjh9fX1jYXRjaChlKXtpZih0eXBlb2YgRlM9PSJ1bmRlZmluZWQifHwhKGUgaW5zdGFuY2VvZiBGUy5FcnJub0Vycm9yKSl0aHJvdyBlO3JldHVybiAtZS5lcnJub319ZnVuY3Rpb24gX19fc3lzY2FsbF9mc3RhdDY0KGZkLGJ1Zil7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRClyZXR1cm4gX2Vtc2NyaXB0ZW5fcHJveHlfdG9fbWFpbl90aHJlYWRfanMoNSwxLGZkLGJ1Zik7dHJ5e3ZhciBzdHJlYW09U1lTQ0FMTFMuZ2V0U3RyZWFtRnJvbUZEKGZkKTtyZXR1cm4gU1lTQ0FMTFMuZG9TdGF0KEZTLnN0YXQsc3RyZWFtLnBhdGgsYnVmKX1jYXRjaChlKXtpZih0eXBlb2YgRlM9PSJ1bmRlZmluZWQifHwhKGUgaW5zdGFuY2VvZiBGUy5FcnJub0Vycm9yKSl0aHJvdyBlO3JldHVybiAtZS5lcnJub319ZnVuY3Rpb24gX19fc3lzY2FsbF9nZXRkZW50czY0KGZkLGRpcnAsY291bnQpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDYsMSxmZCxkaXJwLGNvdW50KTt0cnl7dmFyIHN0cmVhbT1TWVNDQUxMUy5nZXRTdHJlYW1Gcm9tRkQoZmQpO2lmKCFzdHJlYW0uZ2V0ZGVudHMpe3N0cmVhbS5nZXRkZW50cz1GUy5yZWFkZGlyKHN0cmVhbS5wYXRoKTt9dmFyIHN0cnVjdF9zaXplPTI4MDt2YXIgcG9zPTA7dmFyIG9mZj1GUy5sbHNlZWsoc3RyZWFtLDAsMSk7dmFyIGlkeD1NYXRoLmZsb29yKG9mZi9zdHJ1Y3Rfc2l6ZSk7d2hpbGUoaWR4PHN0cmVhbS5nZXRkZW50cy5sZW5ndGgmJnBvcytzdHJ1Y3Rfc2l6ZTw9Y291bnQpe3ZhciBpZDt2YXIgdHlwZTt2YXIgbmFtZT1zdHJlYW0uZ2V0ZGVudHNbaWR4XTtpZihuYW1lPT09Ii4iKXtpZD1zdHJlYW0ubm9kZS5pZDt0eXBlPTQ7fWVsc2UgaWYobmFtZT09PSIuLiIpe3ZhciBsb29rdXA9RlMubG9va3VwUGF0aChzdHJlYW0ucGF0aCx7cGFyZW50OnRydWV9KTtpZD1sb29rdXAubm9kZS5pZDt0eXBlPTQ7fWVsc2Uge3ZhciBjaGlsZD1GUy5sb29rdXBOb2RlKHN0cmVhbS5ub2RlLG5hbWUpO2lkPWNoaWxkLmlkO3R5cGU9RlMuaXNDaHJkZXYoY2hpbGQubW9kZSk/MjpGUy5pc0RpcihjaGlsZC5tb2RlKT80OkZTLmlzTGluayhjaGlsZC5tb2RlKT8xMDo4O310ZW1wSTY0PVtpZD4+PjAsKHRlbXBEb3VibGU9aWQsK01hdGguYWJzKHRlbXBEb3VibGUpPj0xP3RlbXBEb3VibGU+MD8oTWF0aC5taW4oK01hdGguZmxvb3IodGVtcERvdWJsZS80Mjk0OTY3Mjk2KSw0Mjk0OTY3Mjk1KXwwKT4+PjA6fn4rTWF0aC5jZWlsKCh0ZW1wRG91YmxlLSsofn50ZW1wRG91YmxlPj4+MCkpLzQyOTQ5NjcyOTYpPj4+MDowKV0sSEVBUDMyW2RpcnArcG9zPj4yXT10ZW1wSTY0WzBdLEhFQVAzMltkaXJwK3Bvcys0Pj4yXT10ZW1wSTY0WzFdO3RlbXBJNjQ9WyhpZHgrMSkqc3RydWN0X3NpemU+Pj4wLCh0ZW1wRG91YmxlPShpZHgrMSkqc3RydWN0X3NpemUsK01hdGguYWJzKHRlbXBEb3VibGUpPj0xP3RlbXBEb3VibGU+MD8oTWF0aC5taW4oK01hdGguZmxvb3IodGVtcERvdWJsZS80Mjk0OTY3Mjk2KSw0Mjk0OTY3Mjk1KXwwKT4+PjA6fn4rTWF0aC5jZWlsKCh0ZW1wRG91YmxlLSsofn50ZW1wRG91YmxlPj4+MCkpLzQyOTQ5NjcyOTYpPj4+MDowKV0sSEVBUDMyW2RpcnArcG9zKzg+PjJdPXRlbXBJNjRbMF0sSEVBUDMyW2RpcnArcG9zKzEyPj4yXT10ZW1wSTY0WzFdO0hFQVAxNltkaXJwK3BvcysxNj4+MV09MjgwO0hFQVA4W2RpcnArcG9zKzE4Pj4wXT10eXBlO3N0cmluZ1RvVVRGOChuYW1lLGRpcnArcG9zKzE5LDI1Nik7cG9zKz1zdHJ1Y3Rfc2l6ZTtpZHgrPTE7fUZTLmxsc2VlayhzdHJlYW0saWR4KnN0cnVjdF9zaXplLDApO3JldHVybiBwb3N9Y2F0Y2goZSl7aWYodHlwZW9mIEZTPT0idW5kZWZpbmVkInx8IShlIGluc3RhbmNlb2YgRlMuRXJybm9FcnJvcikpdGhyb3cgZTtyZXR1cm4gLWUuZXJybm99fWZ1bmN0aW9uIF9fX3N5c2NhbGxfaW9jdGwoZmQsb3AsdmFyYXJncyl7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRClyZXR1cm4gX2Vtc2NyaXB0ZW5fcHJveHlfdG9fbWFpbl90aHJlYWRfanMoNywxLGZkLG9wLHZhcmFyZ3MpO1NZU0NBTExTLnZhcmFyZ3M9dmFyYXJnczt0cnl7dmFyIHN0cmVhbT1TWVNDQUxMUy5nZXRTdHJlYW1Gcm9tRkQoZmQpO3N3aXRjaChvcCl7Y2FzZSAyMTUwOTpjYXNlIDIxNTA1OntpZighc3RyZWFtLnR0eSlyZXR1cm4gLTU5O3JldHVybiAwfWNhc2UgMjE1MTA6Y2FzZSAyMTUxMTpjYXNlIDIxNTEyOmNhc2UgMjE1MDY6Y2FzZSAyMTUwNzpjYXNlIDIxNTA4OntpZighc3RyZWFtLnR0eSlyZXR1cm4gLTU5O3JldHVybiAwfWNhc2UgMjE1MTk6e2lmKCFzdHJlYW0udHR5KXJldHVybiAtNTk7dmFyIGFyZ3A9U1lTQ0FMTFMuZ2V0KCk7SEVBUDMyW2FyZ3A+PjJdPTA7cmV0dXJuIDB9Y2FzZSAyMTUyMDp7aWYoIXN0cmVhbS50dHkpcmV0dXJuIC01OTtyZXR1cm4gLTI4fWNhc2UgMjE1MzE6e3ZhciBhcmdwPVNZU0NBTExTLmdldCgpO3JldHVybiBGUy5pb2N0bChzdHJlYW0sb3AsYXJncCl9Y2FzZSAyMTUyMzp7aWYoIXN0cmVhbS50dHkpcmV0dXJuIC01OTtyZXR1cm4gMH1jYXNlIDIxNTI0OntpZighc3RyZWFtLnR0eSlyZXR1cm4gLTU5O3JldHVybiAwfWRlZmF1bHQ6cmV0dXJuIC0yOH19Y2F0Y2goZSl7aWYodHlwZW9mIEZTPT0idW5kZWZpbmVkInx8IShlIGluc3RhbmNlb2YgRlMuRXJybm9FcnJvcikpdGhyb3cgZTtyZXR1cm4gLWUuZXJybm99fWZ1bmN0aW9uIF9fX3N5c2NhbGxfbHN0YXQ2NChwYXRoLGJ1Zil7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRClyZXR1cm4gX2Vtc2NyaXB0ZW5fcHJveHlfdG9fbWFpbl90aHJlYWRfanMoOCwxLHBhdGgsYnVmKTt0cnl7cGF0aD1TWVNDQUxMUy5nZXRTdHIocGF0aCk7cmV0dXJuIFNZU0NBTExTLmRvU3RhdChGUy5sc3RhdCxwYXRoLGJ1Zil9Y2F0Y2goZSl7aWYodHlwZW9mIEZTPT0idW5kZWZpbmVkInx8IShlIGluc3RhbmNlb2YgRlMuRXJybm9FcnJvcikpdGhyb3cgZTtyZXR1cm4gLWUuZXJybm99fWZ1bmN0aW9uIF9fX3N5c2NhbGxfbmV3ZnN0YXRhdChkaXJmZCxwYXRoLGJ1ZixmbGFncyl7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRClyZXR1cm4gX2Vtc2NyaXB0ZW5fcHJveHlfdG9fbWFpbl90aHJlYWRfanMoOSwxLGRpcmZkLHBhdGgsYnVmLGZsYWdzKTt0cnl7cGF0aD1TWVNDQUxMUy5nZXRTdHIocGF0aCk7dmFyIG5vZm9sbG93PWZsYWdzJjI1Njt2YXIgYWxsb3dFbXB0eT1mbGFncyY0MDk2O2ZsYWdzPWZsYWdzJn40MzUyO3BhdGg9U1lTQ0FMTFMuY2FsY3VsYXRlQXQoZGlyZmQscGF0aCxhbGxvd0VtcHR5KTtyZXR1cm4gU1lTQ0FMTFMuZG9TdGF0KG5vZm9sbG93P0ZTLmxzdGF0OkZTLnN0YXQscGF0aCxidWYpfWNhdGNoKGUpe2lmKHR5cGVvZiBGUz09InVuZGVmaW5lZCJ8fCEoZSBpbnN0YW5jZW9mIEZTLkVycm5vRXJyb3IpKXRocm93IGU7cmV0dXJuIC1lLmVycm5vfX1mdW5jdGlvbiBfX19zeXNjYWxsX29wZW5hdChkaXJmZCxwYXRoLGZsYWdzLHZhcmFyZ3Mpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDEwLDEsZGlyZmQscGF0aCxmbGFncyx2YXJhcmdzKTtTWVNDQUxMUy52YXJhcmdzPXZhcmFyZ3M7dHJ5e3BhdGg9U1lTQ0FMTFMuZ2V0U3RyKHBhdGgpO3BhdGg9U1lTQ0FMTFMuY2FsY3VsYXRlQXQoZGlyZmQscGF0aCk7dmFyIG1vZGU9dmFyYXJncz9TWVNDQUxMUy5nZXQoKTowO3JldHVybiBGUy5vcGVuKHBhdGgsZmxhZ3MsbW9kZSkuZmR9Y2F0Y2goZSl7aWYodHlwZW9mIEZTPT0idW5kZWZpbmVkInx8IShlIGluc3RhbmNlb2YgRlMuRXJybm9FcnJvcikpdGhyb3cgZTtyZXR1cm4gLWUuZXJybm99fWZ1bmN0aW9uIF9fX3N5c2NhbGxfc3RhdDY0KHBhdGgsYnVmKXtpZihFTlZJUk9OTUVOVF9JU19QVEhSRUFEKXJldHVybiBfZW1zY3JpcHRlbl9wcm94eV90b19tYWluX3RocmVhZF9qcygxMSwxLHBhdGgsYnVmKTt0cnl7cGF0aD1TWVNDQUxMUy5nZXRTdHIocGF0aCk7cmV0dXJuIFNZU0NBTExTLmRvU3RhdChGUy5zdGF0LHBhdGgsYnVmKX1jYXRjaChlKXtpZih0eXBlb2YgRlM9PSJ1bmRlZmluZWQifHwhKGUgaW5zdGFuY2VvZiBGUy5FcnJub0Vycm9yKSl0aHJvdyBlO3JldHVybiAtZS5lcnJub319ZnVuY3Rpb24gX19fc3lzY2FsbF91bmxpbmthdChkaXJmZCxwYXRoLGZsYWdzKXtpZihFTlZJUk9OTUVOVF9JU19QVEhSRUFEKXJldHVybiBfZW1zY3JpcHRlbl9wcm94eV90b19tYWluX3RocmVhZF9qcygxMiwxLGRpcmZkLHBhdGgsZmxhZ3MpO3RyeXtwYXRoPVNZU0NBTExTLmdldFN0cihwYXRoKTtwYXRoPVNZU0NBTExTLmNhbGN1bGF0ZUF0KGRpcmZkLHBhdGgpO2lmKGZsYWdzPT09MCl7RlMudW5saW5rKHBhdGgpO31lbHNlIGlmKGZsYWdzPT09NTEyKXtGUy5ybWRpcihwYXRoKTt9ZWxzZSB7YWJvcnQoIkludmFsaWQgZmxhZ3MgcGFzc2VkIHRvIHVubGlua2F0Iik7fXJldHVybiAwfWNhdGNoKGUpe2lmKHR5cGVvZiBGUz09InVuZGVmaW5lZCJ8fCEoZSBpbnN0YW5jZW9mIEZTLkVycm5vRXJyb3IpKXRocm93IGU7cmV0dXJuIC1lLmVycm5vfX1mdW5jdGlvbiBfX2RsaW5pdChtYWluX2Rzb19oYW5kbGUpe312YXIgZGxvcGVuTWlzc2luZ0Vycm9yPSJUbyB1c2UgZGxvcGVuLCB5b3UgbmVlZCBlbmFibGUgZHluYW1pYyBsaW5raW5nLCBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2Vtc2NyaXB0ZW4tY29yZS9lbXNjcmlwdGVuL3dpa2kvTGlua2luZyI7ZnVuY3Rpb24gX19kbG9wZW5fanMoZmlsZW5hbWUsZmxhZyl7YWJvcnQoZGxvcGVuTWlzc2luZ0Vycm9yKTt9ZnVuY3Rpb24gX19kbHN5bV9qcyhoYW5kbGUsc3ltYm9sKXthYm9ydChkbG9wZW5NaXNzaW5nRXJyb3IpO31mdW5jdGlvbiBfX2VtYmluZF9yZWdpc3Rlcl9iaWdpbnQocHJpbWl0aXZlVHlwZSxuYW1lLHNpemUsbWluUmFuZ2UsbWF4UmFuZ2Upe31mdW5jdGlvbiBnZXRTaGlmdEZyb21TaXplKHNpemUpe3N3aXRjaChzaXplKXtjYXNlIDE6cmV0dXJuIDA7Y2FzZSAyOnJldHVybiAxO2Nhc2UgNDpyZXR1cm4gMjtjYXNlIDg6cmV0dXJuIDM7ZGVmYXVsdDp0aHJvdyBuZXcgVHlwZUVycm9yKCJVbmtub3duIHR5cGUgc2l6ZTogIitzaXplKX19ZnVuY3Rpb24gZW1iaW5kX2luaXRfY2hhckNvZGVzKCl7dmFyIGNvZGVzPW5ldyBBcnJheSgyNTYpO2Zvcih2YXIgaT0wO2k8MjU2OysraSl7Y29kZXNbaV09U3RyaW5nLmZyb21DaGFyQ29kZShpKTt9ZW1iaW5kX2NoYXJDb2Rlcz1jb2Rlczt9dmFyIGVtYmluZF9jaGFyQ29kZXM9dW5kZWZpbmVkO2Z1bmN0aW9uIHJlYWRMYXRpbjFTdHJpbmcocHRyKXt2YXIgcmV0PSIiO3ZhciBjPXB0cjt3aGlsZShIRUFQVThbY10pe3JldCs9ZW1iaW5kX2NoYXJDb2Rlc1tIRUFQVThbYysrXV07fXJldHVybiByZXR9dmFyIGF3YWl0aW5nRGVwZW5kZW5jaWVzPXt9O3ZhciByZWdpc3RlcmVkVHlwZXM9e307dmFyIHR5cGVEZXBlbmRlbmNpZXM9e307dmFyIGNoYXJfMD00ODt2YXIgY2hhcl85PTU3O2Z1bmN0aW9uIG1ha2VMZWdhbEZ1bmN0aW9uTmFtZShuYW1lKXtpZih1bmRlZmluZWQ9PT1uYW1lKXtyZXR1cm4gIl91bmtub3duIn1uYW1lPW5hbWUucmVwbGFjZSgvW15hLXpBLVowLTlfXS9nLCIkIik7dmFyIGY9bmFtZS5jaGFyQ29kZUF0KDApO2lmKGY+PWNoYXJfMCYmZjw9Y2hhcl85KXtyZXR1cm4gIl8iK25hbWV9cmV0dXJuIG5hbWV9ZnVuY3Rpb24gY3JlYXRlTmFtZWRGdW5jdGlvbihuYW1lLGJvZHkpe25hbWU9bWFrZUxlZ2FsRnVuY3Rpb25OYW1lKG5hbWUpO3JldHVybiBuZXcgRnVuY3Rpb24oImJvZHkiLCJyZXR1cm4gZnVuY3Rpb24gIituYW1lKyIoKSB7XG4iKycgICAgInVzZSBzdHJpY3QiOycrIiAgICByZXR1cm4gYm9keS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuIisifTtcbiIpKGJvZHkpfWZ1bmN0aW9uIGV4dGVuZEVycm9yKGJhc2VFcnJvclR5cGUsZXJyb3JOYW1lKXt2YXIgZXJyb3JDbGFzcz1jcmVhdGVOYW1lZEZ1bmN0aW9uKGVycm9yTmFtZSxmdW5jdGlvbihtZXNzYWdlKXt0aGlzLm5hbWU9ZXJyb3JOYW1lO3RoaXMubWVzc2FnZT1tZXNzYWdlO3ZhciBzdGFjaz1uZXcgRXJyb3IobWVzc2FnZSkuc3RhY2s7aWYoc3RhY2shPT11bmRlZmluZWQpe3RoaXMuc3RhY2s9dGhpcy50b1N0cmluZygpKyJcbiIrc3RhY2sucmVwbGFjZSgvXkVycm9yKDpbXlxuXSopP1xuLywiIik7fX0pO2Vycm9yQ2xhc3MucHJvdG90eXBlPU9iamVjdC5jcmVhdGUoYmFzZUVycm9yVHlwZS5wcm90b3R5cGUpO2Vycm9yQ2xhc3MucHJvdG90eXBlLmNvbnN0cnVjdG9yPWVycm9yQ2xhc3M7ZXJyb3JDbGFzcy5wcm90b3R5cGUudG9TdHJpbmc9ZnVuY3Rpb24oKXtpZih0aGlzLm1lc3NhZ2U9PT11bmRlZmluZWQpe3JldHVybiB0aGlzLm5hbWV9ZWxzZSB7cmV0dXJuIHRoaXMubmFtZSsiOiAiK3RoaXMubWVzc2FnZX19O3JldHVybiBlcnJvckNsYXNzfXZhciBCaW5kaW5nRXJyb3I9dW5kZWZpbmVkO2Z1bmN0aW9uIHRocm93QmluZGluZ0Vycm9yKG1lc3NhZ2Upe3Rocm93IG5ldyBCaW5kaW5nRXJyb3IobWVzc2FnZSl9dmFyIEludGVybmFsRXJyb3I9dW5kZWZpbmVkO2Z1bmN0aW9uIHRocm93SW50ZXJuYWxFcnJvcihtZXNzYWdlKXt0aHJvdyBuZXcgSW50ZXJuYWxFcnJvcihtZXNzYWdlKX1mdW5jdGlvbiB3aGVuRGVwZW5kZW50VHlwZXNBcmVSZXNvbHZlZChteVR5cGVzLGRlcGVuZGVudFR5cGVzLGdldFR5cGVDb252ZXJ0ZXJzKXtteVR5cGVzLmZvckVhY2goZnVuY3Rpb24odHlwZSl7dHlwZURlcGVuZGVuY2llc1t0eXBlXT1kZXBlbmRlbnRUeXBlczt9KTtmdW5jdGlvbiBvbkNvbXBsZXRlKHR5cGVDb252ZXJ0ZXJzKXt2YXIgbXlUeXBlQ29udmVydGVycz1nZXRUeXBlQ29udmVydGVycyh0eXBlQ29udmVydGVycyk7aWYobXlUeXBlQ29udmVydGVycy5sZW5ndGghPT1teVR5cGVzLmxlbmd0aCl7dGhyb3dJbnRlcm5hbEVycm9yKCJNaXNtYXRjaGVkIHR5cGUgY29udmVydGVyIGNvdW50Iik7fWZvcih2YXIgaT0wO2k8bXlUeXBlcy5sZW5ndGg7KytpKXtyZWdpc3RlclR5cGUobXlUeXBlc1tpXSxteVR5cGVDb252ZXJ0ZXJzW2ldKTt9fXZhciB0eXBlQ29udmVydGVycz1uZXcgQXJyYXkoZGVwZW5kZW50VHlwZXMubGVuZ3RoKTt2YXIgdW5yZWdpc3RlcmVkVHlwZXM9W107dmFyIHJlZ2lzdGVyZWQ9MDtkZXBlbmRlbnRUeXBlcy5mb3JFYWNoKChkdCxpKT0+e2lmKHJlZ2lzdGVyZWRUeXBlcy5oYXNPd25Qcm9wZXJ0eShkdCkpe3R5cGVDb252ZXJ0ZXJzW2ldPXJlZ2lzdGVyZWRUeXBlc1tkdF07fWVsc2Uge3VucmVnaXN0ZXJlZFR5cGVzLnB1c2goZHQpO2lmKCFhd2FpdGluZ0RlcGVuZGVuY2llcy5oYXNPd25Qcm9wZXJ0eShkdCkpe2F3YWl0aW5nRGVwZW5kZW5jaWVzW2R0XT1bXTt9YXdhaXRpbmdEZXBlbmRlbmNpZXNbZHRdLnB1c2goKCk9Pnt0eXBlQ29udmVydGVyc1tpXT1yZWdpc3RlcmVkVHlwZXNbZHRdOysrcmVnaXN0ZXJlZDtpZihyZWdpc3RlcmVkPT09dW5yZWdpc3RlcmVkVHlwZXMubGVuZ3RoKXtvbkNvbXBsZXRlKHR5cGVDb252ZXJ0ZXJzKTt9fSk7fX0pO2lmKDA9PT11bnJlZ2lzdGVyZWRUeXBlcy5sZW5ndGgpe29uQ29tcGxldGUodHlwZUNvbnZlcnRlcnMpO319ZnVuY3Rpb24gcmVnaXN0ZXJUeXBlKHJhd1R5cGUscmVnaXN0ZXJlZEluc3RhbmNlLG9wdGlvbnM9e30pe2lmKCEoImFyZ1BhY2tBZHZhbmNlImluIHJlZ2lzdGVyZWRJbnN0YW5jZSkpe3Rocm93IG5ldyBUeXBlRXJyb3IoInJlZ2lzdGVyVHlwZSByZWdpc3RlcmVkSW5zdGFuY2UgcmVxdWlyZXMgYXJnUGFja0FkdmFuY2UiKX12YXIgbmFtZT1yZWdpc3RlcmVkSW5zdGFuY2UubmFtZTtpZighcmF3VHlwZSl7dGhyb3dCaW5kaW5nRXJyb3IoJ3R5cGUgIicrbmFtZSsnIiBtdXN0IGhhdmUgYSBwb3NpdGl2ZSBpbnRlZ2VyIHR5cGVpZCBwb2ludGVyJyk7fWlmKHJlZ2lzdGVyZWRUeXBlcy5oYXNPd25Qcm9wZXJ0eShyYXdUeXBlKSl7aWYob3B0aW9ucy5pZ25vcmVEdXBsaWNhdGVSZWdpc3RyYXRpb25zKXtyZXR1cm59ZWxzZSB7dGhyb3dCaW5kaW5nRXJyb3IoIkNhbm5vdCByZWdpc3RlciB0eXBlICciK25hbWUrIicgdHdpY2UiKTt9fXJlZ2lzdGVyZWRUeXBlc1tyYXdUeXBlXT1yZWdpc3RlcmVkSW5zdGFuY2U7ZGVsZXRlIHR5cGVEZXBlbmRlbmNpZXNbcmF3VHlwZV07aWYoYXdhaXRpbmdEZXBlbmRlbmNpZXMuaGFzT3duUHJvcGVydHkocmF3VHlwZSkpe3ZhciBjYWxsYmFja3M9YXdhaXRpbmdEZXBlbmRlbmNpZXNbcmF3VHlwZV07ZGVsZXRlIGF3YWl0aW5nRGVwZW5kZW5jaWVzW3Jhd1R5cGVdO2NhbGxiYWNrcy5mb3JFYWNoKGNiPT5jYigpKTt9fWZ1bmN0aW9uIF9fZW1iaW5kX3JlZ2lzdGVyX2Jvb2wocmF3VHlwZSxuYW1lLHNpemUsdHJ1ZVZhbHVlLGZhbHNlVmFsdWUpe3ZhciBzaGlmdD1nZXRTaGlmdEZyb21TaXplKHNpemUpO25hbWU9cmVhZExhdGluMVN0cmluZyhuYW1lKTtyZWdpc3RlclR5cGUocmF3VHlwZSx7bmFtZTpuYW1lLCJmcm9tV2lyZVR5cGUiOmZ1bmN0aW9uKHd0KXtyZXR1cm4gISF3dH0sInRvV2lyZVR5cGUiOmZ1bmN0aW9uKGRlc3RydWN0b3JzLG8pe3JldHVybiBvP3RydWVWYWx1ZTpmYWxzZVZhbHVlfSwiYXJnUGFja0FkdmFuY2UiOjgsInJlYWRWYWx1ZUZyb21Qb2ludGVyIjpmdW5jdGlvbihwb2ludGVyKXt2YXIgaGVhcDtpZihzaXplPT09MSl7aGVhcD1IRUFQODt9ZWxzZSBpZihzaXplPT09Mil7aGVhcD1IRUFQMTY7fWVsc2UgaWYoc2l6ZT09PTQpe2hlYXA9SEVBUDMyO31lbHNlIHt0aHJvdyBuZXcgVHlwZUVycm9yKCJVbmtub3duIGJvb2xlYW4gdHlwZSBzaXplOiAiK25hbWUpfXJldHVybiB0aGlzWyJmcm9tV2lyZVR5cGUiXShoZWFwW3BvaW50ZXI+PnNoaWZ0XSl9LGRlc3RydWN0b3JGdW5jdGlvbjpudWxsfSk7fWZ1bmN0aW9uIENsYXNzSGFuZGxlX2lzQWxpYXNPZihvdGhlcil7aWYoISh0aGlzIGluc3RhbmNlb2YgQ2xhc3NIYW5kbGUpKXtyZXR1cm4gZmFsc2V9aWYoIShvdGhlciBpbnN0YW5jZW9mIENsYXNzSGFuZGxlKSl7cmV0dXJuIGZhbHNlfXZhciBsZWZ0Q2xhc3M9dGhpcy4kJC5wdHJUeXBlLnJlZ2lzdGVyZWRDbGFzczt2YXIgbGVmdD10aGlzLiQkLnB0cjt2YXIgcmlnaHRDbGFzcz1vdGhlci4kJC5wdHJUeXBlLnJlZ2lzdGVyZWRDbGFzczt2YXIgcmlnaHQ9b3RoZXIuJCQucHRyO3doaWxlKGxlZnRDbGFzcy5iYXNlQ2xhc3Mpe2xlZnQ9bGVmdENsYXNzLnVwY2FzdChsZWZ0KTtsZWZ0Q2xhc3M9bGVmdENsYXNzLmJhc2VDbGFzczt9d2hpbGUocmlnaHRDbGFzcy5iYXNlQ2xhc3Mpe3JpZ2h0PXJpZ2h0Q2xhc3MudXBjYXN0KHJpZ2h0KTtyaWdodENsYXNzPXJpZ2h0Q2xhc3MuYmFzZUNsYXNzO31yZXR1cm4gbGVmdENsYXNzPT09cmlnaHRDbGFzcyYmbGVmdD09PXJpZ2h0fWZ1bmN0aW9uIHNoYWxsb3dDb3B5SW50ZXJuYWxQb2ludGVyKG8pe3JldHVybiB7Y291bnQ6by5jb3VudCxkZWxldGVTY2hlZHVsZWQ6by5kZWxldGVTY2hlZHVsZWQscHJlc2VydmVQb2ludGVyT25EZWxldGU6by5wcmVzZXJ2ZVBvaW50ZXJPbkRlbGV0ZSxwdHI6by5wdHIscHRyVHlwZTpvLnB0clR5cGUsc21hcnRQdHI6by5zbWFydFB0cixzbWFydFB0clR5cGU6by5zbWFydFB0clR5cGV9fWZ1bmN0aW9uIHRocm93SW5zdGFuY2VBbHJlYWR5RGVsZXRlZChvYmope2Z1bmN0aW9uIGdldEluc3RhbmNlVHlwZU5hbWUoaGFuZGxlKXtyZXR1cm4gaGFuZGxlLiQkLnB0clR5cGUucmVnaXN0ZXJlZENsYXNzLm5hbWV9dGhyb3dCaW5kaW5nRXJyb3IoZ2V0SW5zdGFuY2VUeXBlTmFtZShvYmopKyIgaW5zdGFuY2UgYWxyZWFkeSBkZWxldGVkIik7fXZhciBmaW5hbGl6YXRpb25SZWdpc3RyeT1mYWxzZTtmdW5jdGlvbiBkZXRhY2hGaW5hbGl6ZXIoaGFuZGxlKXt9ZnVuY3Rpb24gcnVuRGVzdHJ1Y3RvcigkJCl7aWYoJCQuc21hcnRQdHIpeyQkLnNtYXJ0UHRyVHlwZS5yYXdEZXN0cnVjdG9yKCQkLnNtYXJ0UHRyKTt9ZWxzZSB7JCQucHRyVHlwZS5yZWdpc3RlcmVkQ2xhc3MucmF3RGVzdHJ1Y3RvcigkJC5wdHIpO319ZnVuY3Rpb24gcmVsZWFzZUNsYXNzSGFuZGxlKCQkKXskJC5jb3VudC52YWx1ZS09MTt2YXIgdG9EZWxldGU9MD09PSQkLmNvdW50LnZhbHVlO2lmKHRvRGVsZXRlKXtydW5EZXN0cnVjdG9yKCQkKTt9fWZ1bmN0aW9uIGRvd25jYXN0UG9pbnRlcihwdHIscHRyQ2xhc3MsZGVzaXJlZENsYXNzKXtpZihwdHJDbGFzcz09PWRlc2lyZWRDbGFzcyl7cmV0dXJuIHB0cn1pZih1bmRlZmluZWQ9PT1kZXNpcmVkQ2xhc3MuYmFzZUNsYXNzKXtyZXR1cm4gbnVsbH12YXIgcnY9ZG93bmNhc3RQb2ludGVyKHB0cixwdHJDbGFzcyxkZXNpcmVkQ2xhc3MuYmFzZUNsYXNzKTtpZihydj09PW51bGwpe3JldHVybiBudWxsfXJldHVybiBkZXNpcmVkQ2xhc3MuZG93bmNhc3QocnYpfXZhciByZWdpc3RlcmVkUG9pbnRlcnM9e307ZnVuY3Rpb24gZ2V0SW5oZXJpdGVkSW5zdGFuY2VDb3VudCgpe3JldHVybiBPYmplY3Qua2V5cyhyZWdpc3RlcmVkSW5zdGFuY2VzKS5sZW5ndGh9ZnVuY3Rpb24gZ2V0TGl2ZUluaGVyaXRlZEluc3RhbmNlcygpe3ZhciBydj1bXTtmb3IodmFyIGsgaW4gcmVnaXN0ZXJlZEluc3RhbmNlcyl7aWYocmVnaXN0ZXJlZEluc3RhbmNlcy5oYXNPd25Qcm9wZXJ0eShrKSl7cnYucHVzaChyZWdpc3RlcmVkSW5zdGFuY2VzW2tdKTt9fXJldHVybiBydn12YXIgZGVsZXRpb25RdWV1ZT1bXTtmdW5jdGlvbiBmbHVzaFBlbmRpbmdEZWxldGVzKCl7d2hpbGUoZGVsZXRpb25RdWV1ZS5sZW5ndGgpe3ZhciBvYmo9ZGVsZXRpb25RdWV1ZS5wb3AoKTtvYmouJCQuZGVsZXRlU2NoZWR1bGVkPWZhbHNlO29ialsiZGVsZXRlIl0oKTt9fXZhciBkZWxheUZ1bmN0aW9uPXVuZGVmaW5lZDtmdW5jdGlvbiBzZXREZWxheUZ1bmN0aW9uKGZuKXtkZWxheUZ1bmN0aW9uPWZuO2lmKGRlbGV0aW9uUXVldWUubGVuZ3RoJiZkZWxheUZ1bmN0aW9uKXtkZWxheUZ1bmN0aW9uKGZsdXNoUGVuZGluZ0RlbGV0ZXMpO319ZnVuY3Rpb24gaW5pdF9lbWJpbmQoKXtNb2R1bGVbImdldEluaGVyaXRlZEluc3RhbmNlQ291bnQiXT1nZXRJbmhlcml0ZWRJbnN0YW5jZUNvdW50O01vZHVsZVsiZ2V0TGl2ZUluaGVyaXRlZEluc3RhbmNlcyJdPWdldExpdmVJbmhlcml0ZWRJbnN0YW5jZXM7TW9kdWxlWyJmbHVzaFBlbmRpbmdEZWxldGVzIl09Zmx1c2hQZW5kaW5nRGVsZXRlcztNb2R1bGVbInNldERlbGF5RnVuY3Rpb24iXT1zZXREZWxheUZ1bmN0aW9uO312YXIgcmVnaXN0ZXJlZEluc3RhbmNlcz17fTtmdW5jdGlvbiBnZXRCYXNlc3RQb2ludGVyKGNsYXNzXyxwdHIpe2lmKHB0cj09PXVuZGVmaW5lZCl7dGhyb3dCaW5kaW5nRXJyb3IoInB0ciBzaG91bGQgbm90IGJlIHVuZGVmaW5lZCIpO313aGlsZShjbGFzc18uYmFzZUNsYXNzKXtwdHI9Y2xhc3NfLnVwY2FzdChwdHIpO2NsYXNzXz1jbGFzc18uYmFzZUNsYXNzO31yZXR1cm4gcHRyfWZ1bmN0aW9uIGdldEluaGVyaXRlZEluc3RhbmNlKGNsYXNzXyxwdHIpe3B0cj1nZXRCYXNlc3RQb2ludGVyKGNsYXNzXyxwdHIpO3JldHVybiByZWdpc3RlcmVkSW5zdGFuY2VzW3B0cl19ZnVuY3Rpb24gbWFrZUNsYXNzSGFuZGxlKHByb3RvdHlwZSxyZWNvcmQpe2lmKCFyZWNvcmQucHRyVHlwZXx8IXJlY29yZC5wdHIpe3Rocm93SW50ZXJuYWxFcnJvcigibWFrZUNsYXNzSGFuZGxlIHJlcXVpcmVzIHB0ciBhbmQgcHRyVHlwZSIpO312YXIgaGFzU21hcnRQdHJUeXBlPSEhcmVjb3JkLnNtYXJ0UHRyVHlwZTt2YXIgaGFzU21hcnRQdHI9ISFyZWNvcmQuc21hcnRQdHI7aWYoaGFzU21hcnRQdHJUeXBlIT09aGFzU21hcnRQdHIpe3Rocm93SW50ZXJuYWxFcnJvcigiQm90aCBzbWFydFB0clR5cGUgYW5kIHNtYXJ0UHRyIG11c3QgYmUgc3BlY2lmaWVkIik7fXJlY29yZC5jb3VudD17dmFsdWU6MX07cmV0dXJuIGF0dGFjaEZpbmFsaXplcihPYmplY3QuY3JlYXRlKHByb3RvdHlwZSx7JCQ6e3ZhbHVlOnJlY29yZH19KSl9ZnVuY3Rpb24gUmVnaXN0ZXJlZFBvaW50ZXJfZnJvbVdpcmVUeXBlKHB0cil7dmFyIHJhd1BvaW50ZXI9dGhpcy5nZXRQb2ludGVlKHB0cik7aWYoIXJhd1BvaW50ZXIpe3RoaXMuZGVzdHJ1Y3RvcihwdHIpO3JldHVybiBudWxsfXZhciByZWdpc3RlcmVkSW5zdGFuY2U9Z2V0SW5oZXJpdGVkSW5zdGFuY2UodGhpcy5yZWdpc3RlcmVkQ2xhc3MscmF3UG9pbnRlcik7aWYodW5kZWZpbmVkIT09cmVnaXN0ZXJlZEluc3RhbmNlKXtpZigwPT09cmVnaXN0ZXJlZEluc3RhbmNlLiQkLmNvdW50LnZhbHVlKXtyZWdpc3RlcmVkSW5zdGFuY2UuJCQucHRyPXJhd1BvaW50ZXI7cmVnaXN0ZXJlZEluc3RhbmNlLiQkLnNtYXJ0UHRyPXB0cjtyZXR1cm4gcmVnaXN0ZXJlZEluc3RhbmNlWyJjbG9uZSJdKCl9ZWxzZSB7dmFyIHJ2PXJlZ2lzdGVyZWRJbnN0YW5jZVsiY2xvbmUiXSgpO3RoaXMuZGVzdHJ1Y3RvcihwdHIpO3JldHVybiBydn19ZnVuY3Rpb24gbWFrZURlZmF1bHRIYW5kbGUoKXtpZih0aGlzLmlzU21hcnRQb2ludGVyKXtyZXR1cm4gbWFrZUNsYXNzSGFuZGxlKHRoaXMucmVnaXN0ZXJlZENsYXNzLmluc3RhbmNlUHJvdG90eXBlLHtwdHJUeXBlOnRoaXMucG9pbnRlZVR5cGUscHRyOnJhd1BvaW50ZXIsc21hcnRQdHJUeXBlOnRoaXMsc21hcnRQdHI6cHRyfSl9ZWxzZSB7cmV0dXJuIG1ha2VDbGFzc0hhbmRsZSh0aGlzLnJlZ2lzdGVyZWRDbGFzcy5pbnN0YW5jZVByb3RvdHlwZSx7cHRyVHlwZTp0aGlzLHB0cjpwdHJ9KX19dmFyIGFjdHVhbFR5cGU9dGhpcy5yZWdpc3RlcmVkQ2xhc3MuZ2V0QWN0dWFsVHlwZShyYXdQb2ludGVyKTt2YXIgcmVnaXN0ZXJlZFBvaW50ZXJSZWNvcmQ9cmVnaXN0ZXJlZFBvaW50ZXJzW2FjdHVhbFR5cGVdO2lmKCFyZWdpc3RlcmVkUG9pbnRlclJlY29yZCl7cmV0dXJuIG1ha2VEZWZhdWx0SGFuZGxlLmNhbGwodGhpcyl9dmFyIHRvVHlwZTtpZih0aGlzLmlzQ29uc3Qpe3RvVHlwZT1yZWdpc3RlcmVkUG9pbnRlclJlY29yZC5jb25zdFBvaW50ZXJUeXBlO31lbHNlIHt0b1R5cGU9cmVnaXN0ZXJlZFBvaW50ZXJSZWNvcmQucG9pbnRlclR5cGU7fXZhciBkcD1kb3duY2FzdFBvaW50ZXIocmF3UG9pbnRlcix0aGlzLnJlZ2lzdGVyZWRDbGFzcyx0b1R5cGUucmVnaXN0ZXJlZENsYXNzKTtpZihkcD09PW51bGwpe3JldHVybiBtYWtlRGVmYXVsdEhhbmRsZS5jYWxsKHRoaXMpfWlmKHRoaXMuaXNTbWFydFBvaW50ZXIpe3JldHVybiBtYWtlQ2xhc3NIYW5kbGUodG9UeXBlLnJlZ2lzdGVyZWRDbGFzcy5pbnN0YW5jZVByb3RvdHlwZSx7cHRyVHlwZTp0b1R5cGUscHRyOmRwLHNtYXJ0UHRyVHlwZTp0aGlzLHNtYXJ0UHRyOnB0cn0pfWVsc2Uge3JldHVybiBtYWtlQ2xhc3NIYW5kbGUodG9UeXBlLnJlZ2lzdGVyZWRDbGFzcy5pbnN0YW5jZVByb3RvdHlwZSx7cHRyVHlwZTp0b1R5cGUscHRyOmRwfSl9fWZ1bmN0aW9uIGF0dGFjaEZpbmFsaXplcihoYW5kbGUpe2lmKCJ1bmRlZmluZWQiPT09dHlwZW9mIEZpbmFsaXphdGlvblJlZ2lzdHJ5KXthdHRhY2hGaW5hbGl6ZXI9aGFuZGxlPT5oYW5kbGU7cmV0dXJuIGhhbmRsZX1maW5hbGl6YXRpb25SZWdpc3RyeT1uZXcgRmluYWxpemF0aW9uUmVnaXN0cnkoaW5mbz0+e3JlbGVhc2VDbGFzc0hhbmRsZShpbmZvLiQkKTt9KTthdHRhY2hGaW5hbGl6ZXI9aGFuZGxlPT57dmFyICQkPWhhbmRsZS4kJDt2YXIgaGFzU21hcnRQdHI9ISEkJC5zbWFydFB0cjtpZihoYXNTbWFydFB0cil7dmFyIGluZm89eyQkOiQkfTtmaW5hbGl6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihoYW5kbGUsaW5mbyxoYW5kbGUpO31yZXR1cm4gaGFuZGxlfTtkZXRhY2hGaW5hbGl6ZXI9aGFuZGxlPT5maW5hbGl6YXRpb25SZWdpc3RyeS51bnJlZ2lzdGVyKGhhbmRsZSk7cmV0dXJuIGF0dGFjaEZpbmFsaXplcihoYW5kbGUpfWZ1bmN0aW9uIENsYXNzSGFuZGxlX2Nsb25lKCl7aWYoIXRoaXMuJCQucHRyKXt0aHJvd0luc3RhbmNlQWxyZWFkeURlbGV0ZWQodGhpcyk7fWlmKHRoaXMuJCQucHJlc2VydmVQb2ludGVyT25EZWxldGUpe3RoaXMuJCQuY291bnQudmFsdWUrPTE7cmV0dXJuIHRoaXN9ZWxzZSB7dmFyIGNsb25lPWF0dGFjaEZpbmFsaXplcihPYmplY3QuY3JlYXRlKE9iamVjdC5nZXRQcm90b3R5cGVPZih0aGlzKSx7JCQ6e3ZhbHVlOnNoYWxsb3dDb3B5SW50ZXJuYWxQb2ludGVyKHRoaXMuJCQpfX0pKTtjbG9uZS4kJC5jb3VudC52YWx1ZSs9MTtjbG9uZS4kJC5kZWxldGVTY2hlZHVsZWQ9ZmFsc2U7cmV0dXJuIGNsb25lfX1mdW5jdGlvbiBDbGFzc0hhbmRsZV9kZWxldGUoKXtpZighdGhpcy4kJC5wdHIpe3Rocm93SW5zdGFuY2VBbHJlYWR5RGVsZXRlZCh0aGlzKTt9aWYodGhpcy4kJC5kZWxldGVTY2hlZHVsZWQmJiF0aGlzLiQkLnByZXNlcnZlUG9pbnRlck9uRGVsZXRlKXt0aHJvd0JpbmRpbmdFcnJvcigiT2JqZWN0IGFscmVhZHkgc2NoZWR1bGVkIGZvciBkZWxldGlvbiIpO31kZXRhY2hGaW5hbGl6ZXIodGhpcyk7cmVsZWFzZUNsYXNzSGFuZGxlKHRoaXMuJCQpO2lmKCF0aGlzLiQkLnByZXNlcnZlUG9pbnRlck9uRGVsZXRlKXt0aGlzLiQkLnNtYXJ0UHRyPXVuZGVmaW5lZDt0aGlzLiQkLnB0cj11bmRlZmluZWQ7fX1mdW5jdGlvbiBDbGFzc0hhbmRsZV9pc0RlbGV0ZWQoKXtyZXR1cm4gIXRoaXMuJCQucHRyfWZ1bmN0aW9uIENsYXNzSGFuZGxlX2RlbGV0ZUxhdGVyKCl7aWYoIXRoaXMuJCQucHRyKXt0aHJvd0luc3RhbmNlQWxyZWFkeURlbGV0ZWQodGhpcyk7fWlmKHRoaXMuJCQuZGVsZXRlU2NoZWR1bGVkJiYhdGhpcy4kJC5wcmVzZXJ2ZVBvaW50ZXJPbkRlbGV0ZSl7dGhyb3dCaW5kaW5nRXJyb3IoIk9iamVjdCBhbHJlYWR5IHNjaGVkdWxlZCBmb3IgZGVsZXRpb24iKTt9ZGVsZXRpb25RdWV1ZS5wdXNoKHRoaXMpO2lmKGRlbGV0aW9uUXVldWUubGVuZ3RoPT09MSYmZGVsYXlGdW5jdGlvbil7ZGVsYXlGdW5jdGlvbihmbHVzaFBlbmRpbmdEZWxldGVzKTt9dGhpcy4kJC5kZWxldGVTY2hlZHVsZWQ9dHJ1ZTtyZXR1cm4gdGhpc31mdW5jdGlvbiBpbml0X0NsYXNzSGFuZGxlKCl7Q2xhc3NIYW5kbGUucHJvdG90eXBlWyJpc0FsaWFzT2YiXT1DbGFzc0hhbmRsZV9pc0FsaWFzT2Y7Q2xhc3NIYW5kbGUucHJvdG90eXBlWyJjbG9uZSJdPUNsYXNzSGFuZGxlX2Nsb25lO0NsYXNzSGFuZGxlLnByb3RvdHlwZVsiZGVsZXRlIl09Q2xhc3NIYW5kbGVfZGVsZXRlO0NsYXNzSGFuZGxlLnByb3RvdHlwZVsiaXNEZWxldGVkIl09Q2xhc3NIYW5kbGVfaXNEZWxldGVkO0NsYXNzSGFuZGxlLnByb3RvdHlwZVsiZGVsZXRlTGF0ZXIiXT1DbGFzc0hhbmRsZV9kZWxldGVMYXRlcjt9ZnVuY3Rpb24gQ2xhc3NIYW5kbGUoKXt9ZnVuY3Rpb24gZW5zdXJlT3ZlcmxvYWRUYWJsZShwcm90byxtZXRob2ROYW1lLGh1bWFuTmFtZSl7aWYodW5kZWZpbmVkPT09cHJvdG9bbWV0aG9kTmFtZV0ub3ZlcmxvYWRUYWJsZSl7dmFyIHByZXZGdW5jPXByb3RvW21ldGhvZE5hbWVdO3Byb3RvW21ldGhvZE5hbWVdPWZ1bmN0aW9uKCl7aWYoIXByb3RvW21ldGhvZE5hbWVdLm92ZXJsb2FkVGFibGUuaGFzT3duUHJvcGVydHkoYXJndW1lbnRzLmxlbmd0aCkpe3Rocm93QmluZGluZ0Vycm9yKCJGdW5jdGlvbiAnIitodW1hbk5hbWUrIicgY2FsbGVkIHdpdGggYW4gaW52YWxpZCBudW1iZXIgb2YgYXJndW1lbnRzICgiK2FyZ3VtZW50cy5sZW5ndGgrIikgLSBleHBlY3RzIG9uZSBvZiAoIitwcm90b1ttZXRob2ROYW1lXS5vdmVybG9hZFRhYmxlKyIpISIpO31yZXR1cm4gcHJvdG9bbWV0aG9kTmFtZV0ub3ZlcmxvYWRUYWJsZVthcmd1bWVudHMubGVuZ3RoXS5hcHBseSh0aGlzLGFyZ3VtZW50cyl9O3Byb3RvW21ldGhvZE5hbWVdLm92ZXJsb2FkVGFibGU9W107cHJvdG9bbWV0aG9kTmFtZV0ub3ZlcmxvYWRUYWJsZVtwcmV2RnVuYy5hcmdDb3VudF09cHJldkZ1bmM7fX1mdW5jdGlvbiBleHBvc2VQdWJsaWNTeW1ib2wobmFtZSx2YWx1ZSxudW1Bcmd1bWVudHMpe2lmKE1vZHVsZS5oYXNPd25Qcm9wZXJ0eShuYW1lKSl7aWYodW5kZWZpbmVkPT09bnVtQXJndW1lbnRzfHx1bmRlZmluZWQhPT1Nb2R1bGVbbmFtZV0ub3ZlcmxvYWRUYWJsZSYmdW5kZWZpbmVkIT09TW9kdWxlW25hbWVdLm92ZXJsb2FkVGFibGVbbnVtQXJndW1lbnRzXSl7dGhyb3dCaW5kaW5nRXJyb3IoIkNhbm5vdCByZWdpc3RlciBwdWJsaWMgbmFtZSAnIituYW1lKyInIHR3aWNlIik7fWVuc3VyZU92ZXJsb2FkVGFibGUoTW9kdWxlLG5hbWUsbmFtZSk7aWYoTW9kdWxlLmhhc093blByb3BlcnR5KG51bUFyZ3VtZW50cykpe3Rocm93QmluZGluZ0Vycm9yKCJDYW5ub3QgcmVnaXN0ZXIgbXVsdGlwbGUgb3ZlcmxvYWRzIG9mIGEgZnVuY3Rpb24gd2l0aCB0aGUgc2FtZSBudW1iZXIgb2YgYXJndW1lbnRzICgiK251bUFyZ3VtZW50cysiKSEiKTt9TW9kdWxlW25hbWVdLm92ZXJsb2FkVGFibGVbbnVtQXJndW1lbnRzXT12YWx1ZTt9ZWxzZSB7TW9kdWxlW25hbWVdPXZhbHVlO2lmKHVuZGVmaW5lZCE9PW51bUFyZ3VtZW50cyl7TW9kdWxlW25hbWVdLm51bUFyZ3VtZW50cz1udW1Bcmd1bWVudHM7fX19ZnVuY3Rpb24gUmVnaXN0ZXJlZENsYXNzKG5hbWUsY29uc3RydWN0b3IsaW5zdGFuY2VQcm90b3R5cGUscmF3RGVzdHJ1Y3RvcixiYXNlQ2xhc3MsZ2V0QWN0dWFsVHlwZSx1cGNhc3QsZG93bmNhc3Qpe3RoaXMubmFtZT1uYW1lO3RoaXMuY29uc3RydWN0b3I9Y29uc3RydWN0b3I7dGhpcy5pbnN0YW5jZVByb3RvdHlwZT1pbnN0YW5jZVByb3RvdHlwZTt0aGlzLnJhd0Rlc3RydWN0b3I9cmF3RGVzdHJ1Y3Rvcjt0aGlzLmJhc2VDbGFzcz1iYXNlQ2xhc3M7dGhpcy5nZXRBY3R1YWxUeXBlPWdldEFjdHVhbFR5cGU7dGhpcy51cGNhc3Q9dXBjYXN0O3RoaXMuZG93bmNhc3Q9ZG93bmNhc3Q7dGhpcy5wdXJlVmlydHVhbEZ1bmN0aW9ucz1bXTt9ZnVuY3Rpb24gdXBjYXN0UG9pbnRlcihwdHIscHRyQ2xhc3MsZGVzaXJlZENsYXNzKXt3aGlsZShwdHJDbGFzcyE9PWRlc2lyZWRDbGFzcyl7aWYoIXB0ckNsYXNzLnVwY2FzdCl7dGhyb3dCaW5kaW5nRXJyb3IoIkV4cGVjdGVkIG51bGwgb3IgaW5zdGFuY2Ugb2YgIitkZXNpcmVkQ2xhc3MubmFtZSsiLCBnb3QgYW4gaW5zdGFuY2Ugb2YgIitwdHJDbGFzcy5uYW1lKTt9cHRyPXB0ckNsYXNzLnVwY2FzdChwdHIpO3B0ckNsYXNzPXB0ckNsYXNzLmJhc2VDbGFzczt9cmV0dXJuIHB0cn1mdW5jdGlvbiBjb25zdE5vU21hcnRQdHJSYXdQb2ludGVyVG9XaXJlVHlwZShkZXN0cnVjdG9ycyxoYW5kbGUpe2lmKGhhbmRsZT09PW51bGwpe2lmKHRoaXMuaXNSZWZlcmVuY2Upe3Rocm93QmluZGluZ0Vycm9yKCJudWxsIGlzIG5vdCBhIHZhbGlkICIrdGhpcy5uYW1lKTt9cmV0dXJuIDB9aWYoIWhhbmRsZS4kJCl7dGhyb3dCaW5kaW5nRXJyb3IoJ0Nhbm5vdCBwYXNzICInK2VtYmluZFJlcHIoaGFuZGxlKSsnIiBhcyBhICcrdGhpcy5uYW1lKTt9aWYoIWhhbmRsZS4kJC5wdHIpe3Rocm93QmluZGluZ0Vycm9yKCJDYW5ub3QgcGFzcyBkZWxldGVkIG9iamVjdCBhcyBhIHBvaW50ZXIgb2YgdHlwZSAiK3RoaXMubmFtZSk7fXZhciBoYW5kbGVDbGFzcz1oYW5kbGUuJCQucHRyVHlwZS5yZWdpc3RlcmVkQ2xhc3M7dmFyIHB0cj11cGNhc3RQb2ludGVyKGhhbmRsZS4kJC5wdHIsaGFuZGxlQ2xhc3MsdGhpcy5yZWdpc3RlcmVkQ2xhc3MpO3JldHVybiBwdHJ9ZnVuY3Rpb24gZ2VuZXJpY1BvaW50ZXJUb1dpcmVUeXBlKGRlc3RydWN0b3JzLGhhbmRsZSl7dmFyIHB0cjtpZihoYW5kbGU9PT1udWxsKXtpZih0aGlzLmlzUmVmZXJlbmNlKXt0aHJvd0JpbmRpbmdFcnJvcigibnVsbCBpcyBub3QgYSB2YWxpZCAiK3RoaXMubmFtZSk7fWlmKHRoaXMuaXNTbWFydFBvaW50ZXIpe3B0cj10aGlzLnJhd0NvbnN0cnVjdG9yKCk7aWYoZGVzdHJ1Y3RvcnMhPT1udWxsKXtkZXN0cnVjdG9ycy5wdXNoKHRoaXMucmF3RGVzdHJ1Y3RvcixwdHIpO31yZXR1cm4gcHRyfWVsc2Uge3JldHVybiAwfX1pZighaGFuZGxlLiQkKXt0aHJvd0JpbmRpbmdFcnJvcignQ2Fubm90IHBhc3MgIicrZW1iaW5kUmVwcihoYW5kbGUpKyciIGFzIGEgJyt0aGlzLm5hbWUpO31pZighaGFuZGxlLiQkLnB0cil7dGhyb3dCaW5kaW5nRXJyb3IoIkNhbm5vdCBwYXNzIGRlbGV0ZWQgb2JqZWN0IGFzIGEgcG9pbnRlciBvZiB0eXBlICIrdGhpcy5uYW1lKTt9aWYoIXRoaXMuaXNDb25zdCYmaGFuZGxlLiQkLnB0clR5cGUuaXNDb25zdCl7dGhyb3dCaW5kaW5nRXJyb3IoIkNhbm5vdCBjb252ZXJ0IGFyZ3VtZW50IG9mIHR5cGUgIisoaGFuZGxlLiQkLnNtYXJ0UHRyVHlwZT9oYW5kbGUuJCQuc21hcnRQdHJUeXBlLm5hbWU6aGFuZGxlLiQkLnB0clR5cGUubmFtZSkrIiB0byBwYXJhbWV0ZXIgdHlwZSAiK3RoaXMubmFtZSk7fXZhciBoYW5kbGVDbGFzcz1oYW5kbGUuJCQucHRyVHlwZS5yZWdpc3RlcmVkQ2xhc3M7cHRyPXVwY2FzdFBvaW50ZXIoaGFuZGxlLiQkLnB0cixoYW5kbGVDbGFzcyx0aGlzLnJlZ2lzdGVyZWRDbGFzcyk7aWYodGhpcy5pc1NtYXJ0UG9pbnRlcil7aWYodW5kZWZpbmVkPT09aGFuZGxlLiQkLnNtYXJ0UHRyKXt0aHJvd0JpbmRpbmdFcnJvcigiUGFzc2luZyByYXcgcG9pbnRlciB0byBzbWFydCBwb2ludGVyIGlzIGlsbGVnYWwiKTt9c3dpdGNoKHRoaXMuc2hhcmluZ1BvbGljeSl7Y2FzZSAwOmlmKGhhbmRsZS4kJC5zbWFydFB0clR5cGU9PT10aGlzKXtwdHI9aGFuZGxlLiQkLnNtYXJ0UHRyO31lbHNlIHt0aHJvd0JpbmRpbmdFcnJvcigiQ2Fubm90IGNvbnZlcnQgYXJndW1lbnQgb2YgdHlwZSAiKyhoYW5kbGUuJCQuc21hcnRQdHJUeXBlP2hhbmRsZS4kJC5zbWFydFB0clR5cGUubmFtZTpoYW5kbGUuJCQucHRyVHlwZS5uYW1lKSsiIHRvIHBhcmFtZXRlciB0eXBlICIrdGhpcy5uYW1lKTt9YnJlYWs7Y2FzZSAxOnB0cj1oYW5kbGUuJCQuc21hcnRQdHI7YnJlYWs7Y2FzZSAyOmlmKGhhbmRsZS4kJC5zbWFydFB0clR5cGU9PT10aGlzKXtwdHI9aGFuZGxlLiQkLnNtYXJ0UHRyO31lbHNlIHt2YXIgY2xvbmVkSGFuZGxlPWhhbmRsZVsiY2xvbmUiXSgpO3B0cj10aGlzLnJhd1NoYXJlKHB0cixFbXZhbC50b0hhbmRsZShmdW5jdGlvbigpe2Nsb25lZEhhbmRsZVsiZGVsZXRlIl0oKTt9KSk7aWYoZGVzdHJ1Y3RvcnMhPT1udWxsKXtkZXN0cnVjdG9ycy5wdXNoKHRoaXMucmF3RGVzdHJ1Y3RvcixwdHIpO319YnJlYWs7ZGVmYXVsdDp0aHJvd0JpbmRpbmdFcnJvcigiVW5zdXBwb3J0aW5nIHNoYXJpbmcgcG9saWN5Iik7fX1yZXR1cm4gcHRyfWZ1bmN0aW9uIG5vbkNvbnN0Tm9TbWFydFB0clJhd1BvaW50ZXJUb1dpcmVUeXBlKGRlc3RydWN0b3JzLGhhbmRsZSl7aWYoaGFuZGxlPT09bnVsbCl7aWYodGhpcy5pc1JlZmVyZW5jZSl7dGhyb3dCaW5kaW5nRXJyb3IoIm51bGwgaXMgbm90IGEgdmFsaWQgIit0aGlzLm5hbWUpO31yZXR1cm4gMH1pZighaGFuZGxlLiQkKXt0aHJvd0JpbmRpbmdFcnJvcignQ2Fubm90IHBhc3MgIicrZW1iaW5kUmVwcihoYW5kbGUpKyciIGFzIGEgJyt0aGlzLm5hbWUpO31pZighaGFuZGxlLiQkLnB0cil7dGhyb3dCaW5kaW5nRXJyb3IoIkNhbm5vdCBwYXNzIGRlbGV0ZWQgb2JqZWN0IGFzIGEgcG9pbnRlciBvZiB0eXBlICIrdGhpcy5uYW1lKTt9aWYoaGFuZGxlLiQkLnB0clR5cGUuaXNDb25zdCl7dGhyb3dCaW5kaW5nRXJyb3IoIkNhbm5vdCBjb252ZXJ0IGFyZ3VtZW50IG9mIHR5cGUgIitoYW5kbGUuJCQucHRyVHlwZS5uYW1lKyIgdG8gcGFyYW1ldGVyIHR5cGUgIit0aGlzLm5hbWUpO312YXIgaGFuZGxlQ2xhc3M9aGFuZGxlLiQkLnB0clR5cGUucmVnaXN0ZXJlZENsYXNzO3ZhciBwdHI9dXBjYXN0UG9pbnRlcihoYW5kbGUuJCQucHRyLGhhbmRsZUNsYXNzLHRoaXMucmVnaXN0ZXJlZENsYXNzKTtyZXR1cm4gcHRyfWZ1bmN0aW9uIHNpbXBsZVJlYWRWYWx1ZUZyb21Qb2ludGVyKHBvaW50ZXIpe3JldHVybiB0aGlzWyJmcm9tV2lyZVR5cGUiXShIRUFQMzJbcG9pbnRlcj4+Ml0pfWZ1bmN0aW9uIFJlZ2lzdGVyZWRQb2ludGVyX2dldFBvaW50ZWUocHRyKXtpZih0aGlzLnJhd0dldFBvaW50ZWUpe3B0cj10aGlzLnJhd0dldFBvaW50ZWUocHRyKTt9cmV0dXJuIHB0cn1mdW5jdGlvbiBSZWdpc3RlcmVkUG9pbnRlcl9kZXN0cnVjdG9yKHB0cil7aWYodGhpcy5yYXdEZXN0cnVjdG9yKXt0aGlzLnJhd0Rlc3RydWN0b3IocHRyKTt9fWZ1bmN0aW9uIFJlZ2lzdGVyZWRQb2ludGVyX2RlbGV0ZU9iamVjdChoYW5kbGUpe2lmKGhhbmRsZSE9PW51bGwpe2hhbmRsZVsiZGVsZXRlIl0oKTt9fWZ1bmN0aW9uIGluaXRfUmVnaXN0ZXJlZFBvaW50ZXIoKXtSZWdpc3RlcmVkUG9pbnRlci5wcm90b3R5cGUuZ2V0UG9pbnRlZT1SZWdpc3RlcmVkUG9pbnRlcl9nZXRQb2ludGVlO1JlZ2lzdGVyZWRQb2ludGVyLnByb3RvdHlwZS5kZXN0cnVjdG9yPVJlZ2lzdGVyZWRQb2ludGVyX2Rlc3RydWN0b3I7UmVnaXN0ZXJlZFBvaW50ZXIucHJvdG90eXBlWyJhcmdQYWNrQWR2YW5jZSJdPTg7UmVnaXN0ZXJlZFBvaW50ZXIucHJvdG90eXBlWyJyZWFkVmFsdWVGcm9tUG9pbnRlciJdPXNpbXBsZVJlYWRWYWx1ZUZyb21Qb2ludGVyO1JlZ2lzdGVyZWRQb2ludGVyLnByb3RvdHlwZVsiZGVsZXRlT2JqZWN0Il09UmVnaXN0ZXJlZFBvaW50ZXJfZGVsZXRlT2JqZWN0O1JlZ2lzdGVyZWRQb2ludGVyLnByb3RvdHlwZVsiZnJvbVdpcmVUeXBlIl09UmVnaXN0ZXJlZFBvaW50ZXJfZnJvbVdpcmVUeXBlO31mdW5jdGlvbiBSZWdpc3RlcmVkUG9pbnRlcihuYW1lLHJlZ2lzdGVyZWRDbGFzcyxpc1JlZmVyZW5jZSxpc0NvbnN0LGlzU21hcnRQb2ludGVyLHBvaW50ZWVUeXBlLHNoYXJpbmdQb2xpY3kscmF3R2V0UG9pbnRlZSxyYXdDb25zdHJ1Y3RvcixyYXdTaGFyZSxyYXdEZXN0cnVjdG9yKXt0aGlzLm5hbWU9bmFtZTt0aGlzLnJlZ2lzdGVyZWRDbGFzcz1yZWdpc3RlcmVkQ2xhc3M7dGhpcy5pc1JlZmVyZW5jZT1pc1JlZmVyZW5jZTt0aGlzLmlzQ29uc3Q9aXNDb25zdDt0aGlzLmlzU21hcnRQb2ludGVyPWlzU21hcnRQb2ludGVyO3RoaXMucG9pbnRlZVR5cGU9cG9pbnRlZVR5cGU7dGhpcy5zaGFyaW5nUG9saWN5PXNoYXJpbmdQb2xpY3k7dGhpcy5yYXdHZXRQb2ludGVlPXJhd0dldFBvaW50ZWU7dGhpcy5yYXdDb25zdHJ1Y3Rvcj1yYXdDb25zdHJ1Y3Rvcjt0aGlzLnJhd1NoYXJlPXJhd1NoYXJlO3RoaXMucmF3RGVzdHJ1Y3Rvcj1yYXdEZXN0cnVjdG9yO2lmKCFpc1NtYXJ0UG9pbnRlciYmcmVnaXN0ZXJlZENsYXNzLmJhc2VDbGFzcz09PXVuZGVmaW5lZCl7aWYoaXNDb25zdCl7dGhpc1sidG9XaXJlVHlwZSJdPWNvbnN0Tm9TbWFydFB0clJhd1BvaW50ZXJUb1dpcmVUeXBlO3RoaXMuZGVzdHJ1Y3RvckZ1bmN0aW9uPW51bGw7fWVsc2Uge3RoaXNbInRvV2lyZVR5cGUiXT1ub25Db25zdE5vU21hcnRQdHJSYXdQb2ludGVyVG9XaXJlVHlwZTt0aGlzLmRlc3RydWN0b3JGdW5jdGlvbj1udWxsO319ZWxzZSB7dGhpc1sidG9XaXJlVHlwZSJdPWdlbmVyaWNQb2ludGVyVG9XaXJlVHlwZTt9fWZ1bmN0aW9uIHJlcGxhY2VQdWJsaWNTeW1ib2wobmFtZSx2YWx1ZSxudW1Bcmd1bWVudHMpe2lmKCFNb2R1bGUuaGFzT3duUHJvcGVydHkobmFtZSkpe3Rocm93SW50ZXJuYWxFcnJvcigiUmVwbGFjaW5nIG5vbmV4aXN0YW50IHB1YmxpYyBzeW1ib2wiKTt9aWYodW5kZWZpbmVkIT09TW9kdWxlW25hbWVdLm92ZXJsb2FkVGFibGUmJnVuZGVmaW5lZCE9PW51bUFyZ3VtZW50cyl7TW9kdWxlW25hbWVdLm92ZXJsb2FkVGFibGVbbnVtQXJndW1lbnRzXT12YWx1ZTt9ZWxzZSB7TW9kdWxlW25hbWVdPXZhbHVlO01vZHVsZVtuYW1lXS5hcmdDb3VudD1udW1Bcmd1bWVudHM7fX1mdW5jdGlvbiBkeW5DYWxsTGVnYWN5KHNpZyxwdHIsYXJncyl7dmFyIGY9TW9kdWxlWyJkeW5DYWxsXyIrc2lnXTtyZXR1cm4gYXJncyYmYXJncy5sZW5ndGg/Zi5hcHBseShudWxsLFtwdHJdLmNvbmNhdChhcmdzKSk6Zi5jYWxsKG51bGwscHRyKX1mdW5jdGlvbiBkeW5DYWxsKHNpZyxwdHIsYXJncyl7aWYoc2lnLmluY2x1ZGVzKCJqIikpe3JldHVybiBkeW5DYWxsTGVnYWN5KHNpZyxwdHIsYXJncyl9dmFyIHJ0bj1nZXRXYXNtVGFibGVFbnRyeShwdHIpLmFwcGx5KG51bGwsYXJncyk7cmV0dXJuIHJ0bn1mdW5jdGlvbiBnZXREeW5DYWxsZXIoc2lnLHB0cil7dmFyIGFyZ0NhY2hlPVtdO3JldHVybiBmdW5jdGlvbigpe2FyZ0NhY2hlLmxlbmd0aD0wO09iamVjdC5hc3NpZ24oYXJnQ2FjaGUsYXJndW1lbnRzKTtyZXR1cm4gZHluQ2FsbChzaWcscHRyLGFyZ0NhY2hlKX19ZnVuY3Rpb24gZW1iaW5kX19yZXF1aXJlRnVuY3Rpb24oc2lnbmF0dXJlLHJhd0Z1bmN0aW9uKXtzaWduYXR1cmU9cmVhZExhdGluMVN0cmluZyhzaWduYXR1cmUpO2Z1bmN0aW9uIG1ha2VEeW5DYWxsZXIoKXtpZihzaWduYXR1cmUuaW5jbHVkZXMoImoiKSl7cmV0dXJuIGdldER5bkNhbGxlcihzaWduYXR1cmUscmF3RnVuY3Rpb24pfXJldHVybiBnZXRXYXNtVGFibGVFbnRyeShyYXdGdW5jdGlvbil9dmFyIGZwPW1ha2VEeW5DYWxsZXIoKTtpZih0eXBlb2YgZnAhPSJmdW5jdGlvbiIpe3Rocm93QmluZGluZ0Vycm9yKCJ1bmtub3duIGZ1bmN0aW9uIHBvaW50ZXIgd2l0aCBzaWduYXR1cmUgIitzaWduYXR1cmUrIjogIityYXdGdW5jdGlvbik7fXJldHVybiBmcH12YXIgVW5ib3VuZFR5cGVFcnJvcj11bmRlZmluZWQ7ZnVuY3Rpb24gZ2V0VHlwZU5hbWUodHlwZSl7dmFyIHB0cj1fX19nZXRUeXBlTmFtZSh0eXBlKTt2YXIgcnY9cmVhZExhdGluMVN0cmluZyhwdHIpO19mcmVlKHB0cik7cmV0dXJuIHJ2fWZ1bmN0aW9uIHRocm93VW5ib3VuZFR5cGVFcnJvcihtZXNzYWdlLHR5cGVzKXt2YXIgdW5ib3VuZFR5cGVzPVtdO3ZhciBzZWVuPXt9O2Z1bmN0aW9uIHZpc2l0KHR5cGUpe2lmKHNlZW5bdHlwZV0pe3JldHVybn1pZihyZWdpc3RlcmVkVHlwZXNbdHlwZV0pe3JldHVybn1pZih0eXBlRGVwZW5kZW5jaWVzW3R5cGVdKXt0eXBlRGVwZW5kZW5jaWVzW3R5cGVdLmZvckVhY2godmlzaXQpO3JldHVybn11bmJvdW5kVHlwZXMucHVzaCh0eXBlKTtzZWVuW3R5cGVdPXRydWU7fXR5cGVzLmZvckVhY2godmlzaXQpO3Rocm93IG5ldyBVbmJvdW5kVHlwZUVycm9yKG1lc3NhZ2UrIjogIit1bmJvdW5kVHlwZXMubWFwKGdldFR5cGVOYW1lKS5qb2luKFsiLCAiXSkpfWZ1bmN0aW9uIF9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzKHJhd1R5cGUscmF3UG9pbnRlclR5cGUscmF3Q29uc3RQb2ludGVyVHlwZSxiYXNlQ2xhc3NSYXdUeXBlLGdldEFjdHVhbFR5cGVTaWduYXR1cmUsZ2V0QWN0dWFsVHlwZSx1cGNhc3RTaWduYXR1cmUsdXBjYXN0LGRvd25jYXN0U2lnbmF0dXJlLGRvd25jYXN0LG5hbWUsZGVzdHJ1Y3RvclNpZ25hdHVyZSxyYXdEZXN0cnVjdG9yKXtuYW1lPXJlYWRMYXRpbjFTdHJpbmcobmFtZSk7Z2V0QWN0dWFsVHlwZT1lbWJpbmRfX3JlcXVpcmVGdW5jdGlvbihnZXRBY3R1YWxUeXBlU2lnbmF0dXJlLGdldEFjdHVhbFR5cGUpO2lmKHVwY2FzdCl7dXBjYXN0PWVtYmluZF9fcmVxdWlyZUZ1bmN0aW9uKHVwY2FzdFNpZ25hdHVyZSx1cGNhc3QpO31pZihkb3duY2FzdCl7ZG93bmNhc3Q9ZW1iaW5kX19yZXF1aXJlRnVuY3Rpb24oZG93bmNhc3RTaWduYXR1cmUsZG93bmNhc3QpO31yYXdEZXN0cnVjdG9yPWVtYmluZF9fcmVxdWlyZUZ1bmN0aW9uKGRlc3RydWN0b3JTaWduYXR1cmUscmF3RGVzdHJ1Y3Rvcik7dmFyIGxlZ2FsRnVuY3Rpb25OYW1lPW1ha2VMZWdhbEZ1bmN0aW9uTmFtZShuYW1lKTtleHBvc2VQdWJsaWNTeW1ib2wobGVnYWxGdW5jdGlvbk5hbWUsZnVuY3Rpb24oKXt0aHJvd1VuYm91bmRUeXBlRXJyb3IoIkNhbm5vdCBjb25zdHJ1Y3QgIituYW1lKyIgZHVlIHRvIHVuYm91bmQgdHlwZXMiLFtiYXNlQ2xhc3NSYXdUeXBlXSk7fSk7d2hlbkRlcGVuZGVudFR5cGVzQXJlUmVzb2x2ZWQoW3Jhd1R5cGUscmF3UG9pbnRlclR5cGUscmF3Q29uc3RQb2ludGVyVHlwZV0sYmFzZUNsYXNzUmF3VHlwZT9bYmFzZUNsYXNzUmF3VHlwZV06W10sZnVuY3Rpb24oYmFzZSl7YmFzZT1iYXNlWzBdO3ZhciBiYXNlQ2xhc3M7dmFyIGJhc2VQcm90b3R5cGU7aWYoYmFzZUNsYXNzUmF3VHlwZSl7YmFzZUNsYXNzPWJhc2UucmVnaXN0ZXJlZENsYXNzO2Jhc2VQcm90b3R5cGU9YmFzZUNsYXNzLmluc3RhbmNlUHJvdG90eXBlO31lbHNlIHtiYXNlUHJvdG90eXBlPUNsYXNzSGFuZGxlLnByb3RvdHlwZTt9dmFyIGNvbnN0cnVjdG9yPWNyZWF0ZU5hbWVkRnVuY3Rpb24obGVnYWxGdW5jdGlvbk5hbWUsZnVuY3Rpb24oKXtpZihPYmplY3QuZ2V0UHJvdG90eXBlT2YodGhpcykhPT1pbnN0YW5jZVByb3RvdHlwZSl7dGhyb3cgbmV3IEJpbmRpbmdFcnJvcigiVXNlICduZXcnIHRvIGNvbnN0cnVjdCAiK25hbWUpfWlmKHVuZGVmaW5lZD09PXJlZ2lzdGVyZWRDbGFzcy5jb25zdHJ1Y3Rvcl9ib2R5KXt0aHJvdyBuZXcgQmluZGluZ0Vycm9yKG5hbWUrIiBoYXMgbm8gYWNjZXNzaWJsZSBjb25zdHJ1Y3RvciIpfXZhciBib2R5PXJlZ2lzdGVyZWRDbGFzcy5jb25zdHJ1Y3Rvcl9ib2R5W2FyZ3VtZW50cy5sZW5ndGhdO2lmKHVuZGVmaW5lZD09PWJvZHkpe3Rocm93IG5ldyBCaW5kaW5nRXJyb3IoIlRyaWVkIHRvIGludm9rZSBjdG9yIG9mICIrbmFtZSsiIHdpdGggaW52YWxpZCBudW1iZXIgb2YgcGFyYW1ldGVycyAoIithcmd1bWVudHMubGVuZ3RoKyIpIC0gZXhwZWN0ZWQgKCIrT2JqZWN0LmtleXMocmVnaXN0ZXJlZENsYXNzLmNvbnN0cnVjdG9yX2JvZHkpLnRvU3RyaW5nKCkrIikgcGFyYW1ldGVycyBpbnN0ZWFkISIpfXJldHVybiBib2R5LmFwcGx5KHRoaXMsYXJndW1lbnRzKX0pO3ZhciBpbnN0YW5jZVByb3RvdHlwZT1PYmplY3QuY3JlYXRlKGJhc2VQcm90b3R5cGUse2NvbnN0cnVjdG9yOnt2YWx1ZTpjb25zdHJ1Y3Rvcn19KTtjb25zdHJ1Y3Rvci5wcm90b3R5cGU9aW5zdGFuY2VQcm90b3R5cGU7dmFyIHJlZ2lzdGVyZWRDbGFzcz1uZXcgUmVnaXN0ZXJlZENsYXNzKG5hbWUsY29uc3RydWN0b3IsaW5zdGFuY2VQcm90b3R5cGUscmF3RGVzdHJ1Y3RvcixiYXNlQ2xhc3MsZ2V0QWN0dWFsVHlwZSx1cGNhc3QsZG93bmNhc3QpO3ZhciByZWZlcmVuY2VDb252ZXJ0ZXI9bmV3IFJlZ2lzdGVyZWRQb2ludGVyKG5hbWUscmVnaXN0ZXJlZENsYXNzLHRydWUsZmFsc2UsZmFsc2UpO3ZhciBwb2ludGVyQ29udmVydGVyPW5ldyBSZWdpc3RlcmVkUG9pbnRlcihuYW1lKyIqIixyZWdpc3RlcmVkQ2xhc3MsZmFsc2UsZmFsc2UsZmFsc2UpO3ZhciBjb25zdFBvaW50ZXJDb252ZXJ0ZXI9bmV3IFJlZ2lzdGVyZWRQb2ludGVyKG5hbWUrIiBjb25zdCoiLHJlZ2lzdGVyZWRDbGFzcyxmYWxzZSx0cnVlLGZhbHNlKTtyZWdpc3RlcmVkUG9pbnRlcnNbcmF3VHlwZV09e3BvaW50ZXJUeXBlOnBvaW50ZXJDb252ZXJ0ZXIsY29uc3RQb2ludGVyVHlwZTpjb25zdFBvaW50ZXJDb252ZXJ0ZXJ9O3JlcGxhY2VQdWJsaWNTeW1ib2wobGVnYWxGdW5jdGlvbk5hbWUsY29uc3RydWN0b3IpO3JldHVybiBbcmVmZXJlbmNlQ29udmVydGVyLHBvaW50ZXJDb252ZXJ0ZXIsY29uc3RQb2ludGVyQ29udmVydGVyXX0pO31mdW5jdGlvbiBuZXdfKGNvbnN0cnVjdG9yLGFyZ3VtZW50TGlzdCl7aWYoIShjb25zdHJ1Y3RvciBpbnN0YW5jZW9mIEZ1bmN0aW9uKSl7dGhyb3cgbmV3IFR5cGVFcnJvcigibmV3XyBjYWxsZWQgd2l0aCBjb25zdHJ1Y3RvciB0eXBlICIrdHlwZW9mIGNvbnN0cnVjdG9yKyIgd2hpY2ggaXMgbm90IGEgZnVuY3Rpb24iKX12YXIgZHVtbXk9Y3JlYXRlTmFtZWRGdW5jdGlvbihjb25zdHJ1Y3Rvci5uYW1lfHwidW5rbm93bkZ1bmN0aW9uTmFtZSIsZnVuY3Rpb24oKXt9KTtkdW1teS5wcm90b3R5cGU9Y29uc3RydWN0b3IucHJvdG90eXBlO3ZhciBvYmo9bmV3IGR1bW15O3ZhciByPWNvbnN0cnVjdG9yLmFwcGx5KG9iaixhcmd1bWVudExpc3QpO3JldHVybiByIGluc3RhbmNlb2YgT2JqZWN0P3I6b2JqfWZ1bmN0aW9uIHJ1bkRlc3RydWN0b3JzKGRlc3RydWN0b3JzKXt3aGlsZShkZXN0cnVjdG9ycy5sZW5ndGgpe3ZhciBwdHI9ZGVzdHJ1Y3RvcnMucG9wKCk7dmFyIGRlbD1kZXN0cnVjdG9ycy5wb3AoKTtkZWwocHRyKTt9fWZ1bmN0aW9uIGNyYWZ0SW52b2tlckZ1bmN0aW9uKGh1bWFuTmFtZSxhcmdUeXBlcyxjbGFzc1R5cGUsY3BwSW52b2tlckZ1bmMsY3BwVGFyZ2V0RnVuYyl7dmFyIGFyZ0NvdW50PWFyZ1R5cGVzLmxlbmd0aDtpZihhcmdDb3VudDwyKXt0aHJvd0JpbmRpbmdFcnJvcigiYXJnVHlwZXMgYXJyYXkgc2l6ZSBtaXNtYXRjaCEgTXVzdCBhdCBsZWFzdCBnZXQgcmV0dXJuIHZhbHVlIGFuZCAndGhpcycgdHlwZXMhIik7fXZhciBpc0NsYXNzTWV0aG9kRnVuYz1hcmdUeXBlc1sxXSE9PW51bGwmJmNsYXNzVHlwZSE9PW51bGw7dmFyIG5lZWRzRGVzdHJ1Y3RvclN0YWNrPWZhbHNlO2Zvcih2YXIgaT0xO2k8YXJnVHlwZXMubGVuZ3RoOysraSl7aWYoYXJnVHlwZXNbaV0hPT1udWxsJiZhcmdUeXBlc1tpXS5kZXN0cnVjdG9yRnVuY3Rpb249PT11bmRlZmluZWQpe25lZWRzRGVzdHJ1Y3RvclN0YWNrPXRydWU7YnJlYWt9fXZhciByZXR1cm5zPWFyZ1R5cGVzWzBdLm5hbWUhPT0idm9pZCI7dmFyIGFyZ3NMaXN0PSIiO3ZhciBhcmdzTGlzdFdpcmVkPSIiO2Zvcih2YXIgaT0wO2k8YXJnQ291bnQtMjsrK2kpe2FyZ3NMaXN0Kz0oaSE9PTA/IiwgIjoiIikrImFyZyIraTthcmdzTGlzdFdpcmVkKz0oaSE9PTA/IiwgIjoiIikrImFyZyIraSsiV2lyZWQiO312YXIgaW52b2tlckZuQm9keT0icmV0dXJuIGZ1bmN0aW9uICIrbWFrZUxlZ2FsRnVuY3Rpb25OYW1lKGh1bWFuTmFtZSkrIigiK2FyZ3NMaXN0KyIpIHtcbiIrImlmIChhcmd1bWVudHMubGVuZ3RoICE9PSAiKyhhcmdDb3VudC0yKSsiKSB7XG4iKyJ0aHJvd0JpbmRpbmdFcnJvcignZnVuY3Rpb24gIitodW1hbk5hbWUrIiBjYWxsZWQgd2l0aCAnICsgYXJndW1lbnRzLmxlbmd0aCArICcgYXJndW1lbnRzLCBleHBlY3RlZCAiKyhhcmdDb3VudC0yKSsiIGFyZ3MhJyk7XG4iKyJ9XG4iO2lmKG5lZWRzRGVzdHJ1Y3RvclN0YWNrKXtpbnZva2VyRm5Cb2R5Kz0idmFyIGRlc3RydWN0b3JzID0gW107XG4iO312YXIgZHRvclN0YWNrPW5lZWRzRGVzdHJ1Y3RvclN0YWNrPyJkZXN0cnVjdG9ycyI6Im51bGwiO3ZhciBhcmdzMT1bInRocm93QmluZGluZ0Vycm9yIiwiaW52b2tlciIsImZuIiwicnVuRGVzdHJ1Y3RvcnMiLCJyZXRUeXBlIiwiY2xhc3NQYXJhbSJdO3ZhciBhcmdzMj1bdGhyb3dCaW5kaW5nRXJyb3IsY3BwSW52b2tlckZ1bmMsY3BwVGFyZ2V0RnVuYyxydW5EZXN0cnVjdG9ycyxhcmdUeXBlc1swXSxhcmdUeXBlc1sxXV07aWYoaXNDbGFzc01ldGhvZEZ1bmMpe2ludm9rZXJGbkJvZHkrPSJ2YXIgdGhpc1dpcmVkID0gY2xhc3NQYXJhbS50b1dpcmVUeXBlKCIrZHRvclN0YWNrKyIsIHRoaXMpO1xuIjt9Zm9yKHZhciBpPTA7aTxhcmdDb3VudC0yOysraSl7aW52b2tlckZuQm9keSs9InZhciBhcmciK2krIldpcmVkID0gYXJnVHlwZSIraSsiLnRvV2lyZVR5cGUoIitkdG9yU3RhY2srIiwgYXJnIitpKyIpOyAvLyAiK2FyZ1R5cGVzW2krMl0ubmFtZSsiXG4iO2FyZ3MxLnB1c2goImFyZ1R5cGUiK2kpO2FyZ3MyLnB1c2goYXJnVHlwZXNbaSsyXSk7fWlmKGlzQ2xhc3NNZXRob2RGdW5jKXthcmdzTGlzdFdpcmVkPSJ0aGlzV2lyZWQiKyhhcmdzTGlzdFdpcmVkLmxlbmd0aD4wPyIsICI6IiIpK2FyZ3NMaXN0V2lyZWQ7fWludm9rZXJGbkJvZHkrPShyZXR1cm5zPyJ2YXIgcnYgPSAiOiIiKSsiaW52b2tlcihmbiIrKGFyZ3NMaXN0V2lyZWQubGVuZ3RoPjA/IiwgIjoiIikrYXJnc0xpc3RXaXJlZCsiKTtcbiI7aWYobmVlZHNEZXN0cnVjdG9yU3RhY2spe2ludm9rZXJGbkJvZHkrPSJydW5EZXN0cnVjdG9ycyhkZXN0cnVjdG9ycyk7XG4iO31lbHNlIHtmb3IodmFyIGk9aXNDbGFzc01ldGhvZEZ1bmM/MToyO2k8YXJnVHlwZXMubGVuZ3RoOysraSl7dmFyIHBhcmFtTmFtZT1pPT09MT8idGhpc1dpcmVkIjoiYXJnIisoaS0yKSsiV2lyZWQiO2lmKGFyZ1R5cGVzW2ldLmRlc3RydWN0b3JGdW5jdGlvbiE9PW51bGwpe2ludm9rZXJGbkJvZHkrPXBhcmFtTmFtZSsiX2R0b3IoIitwYXJhbU5hbWUrIik7IC8vICIrYXJnVHlwZXNbaV0ubmFtZSsiXG4iO2FyZ3MxLnB1c2gocGFyYW1OYW1lKyJfZHRvciIpO2FyZ3MyLnB1c2goYXJnVHlwZXNbaV0uZGVzdHJ1Y3RvckZ1bmN0aW9uKTt9fX1pZihyZXR1cm5zKXtpbnZva2VyRm5Cb2R5Kz0idmFyIHJldCA9IHJldFR5cGUuZnJvbVdpcmVUeXBlKHJ2KTtcbiIrInJldHVybiByZXQ7XG4iO31pbnZva2VyRm5Cb2R5Kz0ifVxuIjthcmdzMS5wdXNoKGludm9rZXJGbkJvZHkpO3ZhciBpbnZva2VyRnVuY3Rpb249bmV3XyhGdW5jdGlvbixhcmdzMSkuYXBwbHkobnVsbCxhcmdzMik7cmV0dXJuIGludm9rZXJGdW5jdGlvbn1mdW5jdGlvbiBoZWFwMzJWZWN0b3JUb0FycmF5KGNvdW50LGZpcnN0RWxlbWVudCl7dmFyIGFycmF5PVtdO2Zvcih2YXIgaT0wO2k8Y291bnQ7aSsrKXthcnJheS5wdXNoKEhFQVBVMzJbZmlyc3RFbGVtZW50K2kqND4+Ml0pO31yZXR1cm4gYXJyYXl9ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfY2xhc3NfY2xhc3NfZnVuY3Rpb24ocmF3Q2xhc3NUeXBlLG1ldGhvZE5hbWUsYXJnQ291bnQscmF3QXJnVHlwZXNBZGRyLGludm9rZXJTaWduYXR1cmUscmF3SW52b2tlcixmbil7dmFyIHJhd0FyZ1R5cGVzPWhlYXAzMlZlY3RvclRvQXJyYXkoYXJnQ291bnQscmF3QXJnVHlwZXNBZGRyKTttZXRob2ROYW1lPXJlYWRMYXRpbjFTdHJpbmcobWV0aG9kTmFtZSk7cmF3SW52b2tlcj1lbWJpbmRfX3JlcXVpcmVGdW5jdGlvbihpbnZva2VyU2lnbmF0dXJlLHJhd0ludm9rZXIpO3doZW5EZXBlbmRlbnRUeXBlc0FyZVJlc29sdmVkKFtdLFtyYXdDbGFzc1R5cGVdLGZ1bmN0aW9uKGNsYXNzVHlwZSl7Y2xhc3NUeXBlPWNsYXNzVHlwZVswXTt2YXIgaHVtYW5OYW1lPWNsYXNzVHlwZS5uYW1lKyIuIittZXRob2ROYW1lO2Z1bmN0aW9uIHVuYm91bmRUeXBlc0hhbmRsZXIoKXt0aHJvd1VuYm91bmRUeXBlRXJyb3IoIkNhbm5vdCBjYWxsICIraHVtYW5OYW1lKyIgZHVlIHRvIHVuYm91bmQgdHlwZXMiLHJhd0FyZ1R5cGVzKTt9aWYobWV0aG9kTmFtZS5zdGFydHNXaXRoKCJAQCIpKXttZXRob2ROYW1lPVN5bWJvbFttZXRob2ROYW1lLnN1YnN0cmluZygyKV07fXZhciBwcm90bz1jbGFzc1R5cGUucmVnaXN0ZXJlZENsYXNzLmNvbnN0cnVjdG9yO2lmKHVuZGVmaW5lZD09PXByb3RvW21ldGhvZE5hbWVdKXt1bmJvdW5kVHlwZXNIYW5kbGVyLmFyZ0NvdW50PWFyZ0NvdW50LTE7cHJvdG9bbWV0aG9kTmFtZV09dW5ib3VuZFR5cGVzSGFuZGxlcjt9ZWxzZSB7ZW5zdXJlT3ZlcmxvYWRUYWJsZShwcm90byxtZXRob2ROYW1lLGh1bWFuTmFtZSk7cHJvdG9bbWV0aG9kTmFtZV0ub3ZlcmxvYWRUYWJsZVthcmdDb3VudC0xXT11bmJvdW5kVHlwZXNIYW5kbGVyO313aGVuRGVwZW5kZW50VHlwZXNBcmVSZXNvbHZlZChbXSxyYXdBcmdUeXBlcyxmdW5jdGlvbihhcmdUeXBlcyl7dmFyIGludm9rZXJBcmdzQXJyYXk9W2FyZ1R5cGVzWzBdLG51bGxdLmNvbmNhdChhcmdUeXBlcy5zbGljZSgxKSk7dmFyIGZ1bmM9Y3JhZnRJbnZva2VyRnVuY3Rpb24oaHVtYW5OYW1lLGludm9rZXJBcmdzQXJyYXksbnVsbCxyYXdJbnZva2VyLGZuKTtpZih1bmRlZmluZWQ9PT1wcm90b1ttZXRob2ROYW1lXS5vdmVybG9hZFRhYmxlKXtmdW5jLmFyZ0NvdW50PWFyZ0NvdW50LTE7cHJvdG9bbWV0aG9kTmFtZV09ZnVuYzt9ZWxzZSB7cHJvdG9bbWV0aG9kTmFtZV0ub3ZlcmxvYWRUYWJsZVthcmdDb3VudC0xXT1mdW5jO31yZXR1cm4gW119KTtyZXR1cm4gW119KTt9ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfY2xhc3NfY29uc3RydWN0b3IocmF3Q2xhc3NUeXBlLGFyZ0NvdW50LHJhd0FyZ1R5cGVzQWRkcixpbnZva2VyU2lnbmF0dXJlLGludm9rZXIscmF3Q29uc3RydWN0b3Ipe2Fzc2VydChhcmdDb3VudD4wKTt2YXIgcmF3QXJnVHlwZXM9aGVhcDMyVmVjdG9yVG9BcnJheShhcmdDb3VudCxyYXdBcmdUeXBlc0FkZHIpO2ludm9rZXI9ZW1iaW5kX19yZXF1aXJlRnVuY3Rpb24oaW52b2tlclNpZ25hdHVyZSxpbnZva2VyKTt3aGVuRGVwZW5kZW50VHlwZXNBcmVSZXNvbHZlZChbXSxbcmF3Q2xhc3NUeXBlXSxmdW5jdGlvbihjbGFzc1R5cGUpe2NsYXNzVHlwZT1jbGFzc1R5cGVbMF07dmFyIGh1bWFuTmFtZT0iY29uc3RydWN0b3IgIitjbGFzc1R5cGUubmFtZTtpZih1bmRlZmluZWQ9PT1jbGFzc1R5cGUucmVnaXN0ZXJlZENsYXNzLmNvbnN0cnVjdG9yX2JvZHkpe2NsYXNzVHlwZS5yZWdpc3RlcmVkQ2xhc3MuY29uc3RydWN0b3JfYm9keT1bXTt9aWYodW5kZWZpbmVkIT09Y2xhc3NUeXBlLnJlZ2lzdGVyZWRDbGFzcy5jb25zdHJ1Y3Rvcl9ib2R5W2FyZ0NvdW50LTFdKXt0aHJvdyBuZXcgQmluZGluZ0Vycm9yKCJDYW5ub3QgcmVnaXN0ZXIgbXVsdGlwbGUgY29uc3RydWN0b3JzIHdpdGggaWRlbnRpY2FsIG51bWJlciBvZiBwYXJhbWV0ZXJzICgiKyhhcmdDb3VudC0xKSsiKSBmb3IgY2xhc3MgJyIrY2xhc3NUeXBlLm5hbWUrIichIE92ZXJsb2FkIHJlc29sdXRpb24gaXMgY3VycmVudGx5IG9ubHkgcGVyZm9ybWVkIHVzaW5nIHRoZSBwYXJhbWV0ZXIgY291bnQsIG5vdCBhY3R1YWwgdHlwZSBpbmZvISIpfWNsYXNzVHlwZS5yZWdpc3RlcmVkQ2xhc3MuY29uc3RydWN0b3JfYm9keVthcmdDb3VudC0xXT0oKT0+e3Rocm93VW5ib3VuZFR5cGVFcnJvcigiQ2Fubm90IGNvbnN0cnVjdCAiK2NsYXNzVHlwZS5uYW1lKyIgZHVlIHRvIHVuYm91bmQgdHlwZXMiLHJhd0FyZ1R5cGVzKTt9O3doZW5EZXBlbmRlbnRUeXBlc0FyZVJlc29sdmVkKFtdLHJhd0FyZ1R5cGVzLGZ1bmN0aW9uKGFyZ1R5cGVzKXthcmdUeXBlcy5zcGxpY2UoMSwwLG51bGwpO2NsYXNzVHlwZS5yZWdpc3RlcmVkQ2xhc3MuY29uc3RydWN0b3JfYm9keVthcmdDb3VudC0xXT1jcmFmdEludm9rZXJGdW5jdGlvbihodW1hbk5hbWUsYXJnVHlwZXMsbnVsbCxpbnZva2VyLHJhd0NvbnN0cnVjdG9yKTtyZXR1cm4gW119KTtyZXR1cm4gW119KTt9ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfY2xhc3NfZnVuY3Rpb24ocmF3Q2xhc3NUeXBlLG1ldGhvZE5hbWUsYXJnQ291bnQscmF3QXJnVHlwZXNBZGRyLGludm9rZXJTaWduYXR1cmUscmF3SW52b2tlcixjb250ZXh0LGlzUHVyZVZpcnR1YWwpe3ZhciByYXdBcmdUeXBlcz1oZWFwMzJWZWN0b3JUb0FycmF5KGFyZ0NvdW50LHJhd0FyZ1R5cGVzQWRkcik7bWV0aG9kTmFtZT1yZWFkTGF0aW4xU3RyaW5nKG1ldGhvZE5hbWUpO3Jhd0ludm9rZXI9ZW1iaW5kX19yZXF1aXJlRnVuY3Rpb24oaW52b2tlclNpZ25hdHVyZSxyYXdJbnZva2VyKTt3aGVuRGVwZW5kZW50VHlwZXNBcmVSZXNvbHZlZChbXSxbcmF3Q2xhc3NUeXBlXSxmdW5jdGlvbihjbGFzc1R5cGUpe2NsYXNzVHlwZT1jbGFzc1R5cGVbMF07dmFyIGh1bWFuTmFtZT1jbGFzc1R5cGUubmFtZSsiLiIrbWV0aG9kTmFtZTtpZihtZXRob2ROYW1lLnN0YXJ0c1dpdGgoIkBAIikpe21ldGhvZE5hbWU9U3ltYm9sW21ldGhvZE5hbWUuc3Vic3RyaW5nKDIpXTt9aWYoaXNQdXJlVmlydHVhbCl7Y2xhc3NUeXBlLnJlZ2lzdGVyZWRDbGFzcy5wdXJlVmlydHVhbEZ1bmN0aW9ucy5wdXNoKG1ldGhvZE5hbWUpO31mdW5jdGlvbiB1bmJvdW5kVHlwZXNIYW5kbGVyKCl7dGhyb3dVbmJvdW5kVHlwZUVycm9yKCJDYW5ub3QgY2FsbCAiK2h1bWFuTmFtZSsiIGR1ZSB0byB1bmJvdW5kIHR5cGVzIixyYXdBcmdUeXBlcyk7fXZhciBwcm90bz1jbGFzc1R5cGUucmVnaXN0ZXJlZENsYXNzLmluc3RhbmNlUHJvdG90eXBlO3ZhciBtZXRob2Q9cHJvdG9bbWV0aG9kTmFtZV07aWYodW5kZWZpbmVkPT09bWV0aG9kfHx1bmRlZmluZWQ9PT1tZXRob2Qub3ZlcmxvYWRUYWJsZSYmbWV0aG9kLmNsYXNzTmFtZSE9PWNsYXNzVHlwZS5uYW1lJiZtZXRob2QuYXJnQ291bnQ9PT1hcmdDb3VudC0yKXt1bmJvdW5kVHlwZXNIYW5kbGVyLmFyZ0NvdW50PWFyZ0NvdW50LTI7dW5ib3VuZFR5cGVzSGFuZGxlci5jbGFzc05hbWU9Y2xhc3NUeXBlLm5hbWU7cHJvdG9bbWV0aG9kTmFtZV09dW5ib3VuZFR5cGVzSGFuZGxlcjt9ZWxzZSB7ZW5zdXJlT3ZlcmxvYWRUYWJsZShwcm90byxtZXRob2ROYW1lLGh1bWFuTmFtZSk7cHJvdG9bbWV0aG9kTmFtZV0ub3ZlcmxvYWRUYWJsZVthcmdDb3VudC0yXT11bmJvdW5kVHlwZXNIYW5kbGVyO313aGVuRGVwZW5kZW50VHlwZXNBcmVSZXNvbHZlZChbXSxyYXdBcmdUeXBlcyxmdW5jdGlvbihhcmdUeXBlcyl7dmFyIG1lbWJlckZ1bmN0aW9uPWNyYWZ0SW52b2tlckZ1bmN0aW9uKGh1bWFuTmFtZSxhcmdUeXBlcyxjbGFzc1R5cGUscmF3SW52b2tlcixjb250ZXh0KTtpZih1bmRlZmluZWQ9PT1wcm90b1ttZXRob2ROYW1lXS5vdmVybG9hZFRhYmxlKXttZW1iZXJGdW5jdGlvbi5hcmdDb3VudD1hcmdDb3VudC0yO3Byb3RvW21ldGhvZE5hbWVdPW1lbWJlckZ1bmN0aW9uO31lbHNlIHtwcm90b1ttZXRob2ROYW1lXS5vdmVybG9hZFRhYmxlW2FyZ0NvdW50LTJdPW1lbWJlckZ1bmN0aW9uO31yZXR1cm4gW119KTtyZXR1cm4gW119KTt9dmFyIGVtdmFsX2ZyZWVfbGlzdD1bXTt2YXIgZW12YWxfaGFuZGxlX2FycmF5PVt7fSx7dmFsdWU6dW5kZWZpbmVkfSx7dmFsdWU6bnVsbH0se3ZhbHVlOnRydWV9LHt2YWx1ZTpmYWxzZX1dO2Z1bmN0aW9uIF9fZW12YWxfZGVjcmVmKGhhbmRsZSl7aWYoaGFuZGxlPjQmJjA9PT0tLWVtdmFsX2hhbmRsZV9hcnJheVtoYW5kbGVdLnJlZmNvdW50KXtlbXZhbF9oYW5kbGVfYXJyYXlbaGFuZGxlXT11bmRlZmluZWQ7ZW12YWxfZnJlZV9saXN0LnB1c2goaGFuZGxlKTt9fWZ1bmN0aW9uIGNvdW50X2VtdmFsX2hhbmRsZXMoKXt2YXIgY291bnQ9MDtmb3IodmFyIGk9NTtpPGVtdmFsX2hhbmRsZV9hcnJheS5sZW5ndGg7KytpKXtpZihlbXZhbF9oYW5kbGVfYXJyYXlbaV0hPT11bmRlZmluZWQpeysrY291bnQ7fX1yZXR1cm4gY291bnR9ZnVuY3Rpb24gZ2V0X2ZpcnN0X2VtdmFsKCl7Zm9yKHZhciBpPTU7aTxlbXZhbF9oYW5kbGVfYXJyYXkubGVuZ3RoOysraSl7aWYoZW12YWxfaGFuZGxlX2FycmF5W2ldIT09dW5kZWZpbmVkKXtyZXR1cm4gZW12YWxfaGFuZGxlX2FycmF5W2ldfX1yZXR1cm4gbnVsbH1mdW5jdGlvbiBpbml0X2VtdmFsKCl7TW9kdWxlWyJjb3VudF9lbXZhbF9oYW5kbGVzIl09Y291bnRfZW12YWxfaGFuZGxlcztNb2R1bGVbImdldF9maXJzdF9lbXZhbCJdPWdldF9maXJzdF9lbXZhbDt9dmFyIEVtdmFsPXt0b1ZhbHVlOmhhbmRsZT0+e2lmKCFoYW5kbGUpe3Rocm93QmluZGluZ0Vycm9yKCJDYW5ub3QgdXNlIGRlbGV0ZWQgdmFsLiBoYW5kbGUgPSAiK2hhbmRsZSk7fXJldHVybiBlbXZhbF9oYW5kbGVfYXJyYXlbaGFuZGxlXS52YWx1ZX0sdG9IYW5kbGU6dmFsdWU9Pntzd2l0Y2godmFsdWUpe2Nhc2UgdW5kZWZpbmVkOnJldHVybiAxO2Nhc2UgbnVsbDpyZXR1cm4gMjtjYXNlIHRydWU6cmV0dXJuIDM7Y2FzZSBmYWxzZTpyZXR1cm4gNDtkZWZhdWx0Ont2YXIgaGFuZGxlPWVtdmFsX2ZyZWVfbGlzdC5sZW5ndGg/ZW12YWxfZnJlZV9saXN0LnBvcCgpOmVtdmFsX2hhbmRsZV9hcnJheS5sZW5ndGg7ZW12YWxfaGFuZGxlX2FycmF5W2hhbmRsZV09e3JlZmNvdW50OjEsdmFsdWU6dmFsdWV9O3JldHVybiBoYW5kbGV9fX19O2Z1bmN0aW9uIF9fZW1iaW5kX3JlZ2lzdGVyX2VtdmFsKHJhd1R5cGUsbmFtZSl7bmFtZT1yZWFkTGF0aW4xU3RyaW5nKG5hbWUpO3JlZ2lzdGVyVHlwZShyYXdUeXBlLHtuYW1lOm5hbWUsImZyb21XaXJlVHlwZSI6ZnVuY3Rpb24oaGFuZGxlKXt2YXIgcnY9RW12YWwudG9WYWx1ZShoYW5kbGUpO19fZW12YWxfZGVjcmVmKGhhbmRsZSk7cmV0dXJuIHJ2fSwidG9XaXJlVHlwZSI6ZnVuY3Rpb24oZGVzdHJ1Y3RvcnMsdmFsdWUpe3JldHVybiBFbXZhbC50b0hhbmRsZSh2YWx1ZSl9LCJhcmdQYWNrQWR2YW5jZSI6OCwicmVhZFZhbHVlRnJvbVBvaW50ZXIiOnNpbXBsZVJlYWRWYWx1ZUZyb21Qb2ludGVyLGRlc3RydWN0b3JGdW5jdGlvbjpudWxsfSk7fWZ1bmN0aW9uIGVtYmluZFJlcHIodil7aWYodj09PW51bGwpe3JldHVybiAibnVsbCJ9dmFyIHQ9dHlwZW9mIHY7aWYodD09PSJvYmplY3QifHx0PT09ImFycmF5Inx8dD09PSJmdW5jdGlvbiIpe3JldHVybiB2LnRvU3RyaW5nKCl9ZWxzZSB7cmV0dXJuICIiK3Z9fWZ1bmN0aW9uIGZsb2F0UmVhZFZhbHVlRnJvbVBvaW50ZXIobmFtZSxzaGlmdCl7c3dpdGNoKHNoaWZ0KXtjYXNlIDI6cmV0dXJuIGZ1bmN0aW9uKHBvaW50ZXIpe3JldHVybiB0aGlzWyJmcm9tV2lyZVR5cGUiXShIRUFQRjMyW3BvaW50ZXI+PjJdKX07Y2FzZSAzOnJldHVybiBmdW5jdGlvbihwb2ludGVyKXtyZXR1cm4gdGhpc1siZnJvbVdpcmVUeXBlIl0oSEVBUEY2NFtwb2ludGVyPj4zXSl9O2RlZmF1bHQ6dGhyb3cgbmV3IFR5cGVFcnJvcigiVW5rbm93biBmbG9hdCB0eXBlOiAiK25hbWUpfX1mdW5jdGlvbiBfX2VtYmluZF9yZWdpc3Rlcl9mbG9hdChyYXdUeXBlLG5hbWUsc2l6ZSl7dmFyIHNoaWZ0PWdldFNoaWZ0RnJvbVNpemUoc2l6ZSk7bmFtZT1yZWFkTGF0aW4xU3RyaW5nKG5hbWUpO3JlZ2lzdGVyVHlwZShyYXdUeXBlLHtuYW1lOm5hbWUsImZyb21XaXJlVHlwZSI6ZnVuY3Rpb24odmFsdWUpe3JldHVybiB2YWx1ZX0sInRvV2lyZVR5cGUiOmZ1bmN0aW9uKGRlc3RydWN0b3JzLHZhbHVlKXtyZXR1cm4gdmFsdWV9LCJhcmdQYWNrQWR2YW5jZSI6OCwicmVhZFZhbHVlRnJvbVBvaW50ZXIiOmZsb2F0UmVhZFZhbHVlRnJvbVBvaW50ZXIobmFtZSxzaGlmdCksZGVzdHJ1Y3RvckZ1bmN0aW9uOm51bGx9KTt9ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfZnVuY3Rpb24obmFtZSxhcmdDb3VudCxyYXdBcmdUeXBlc0FkZHIsc2lnbmF0dXJlLHJhd0ludm9rZXIsZm4pe3ZhciBhcmdUeXBlcz1oZWFwMzJWZWN0b3JUb0FycmF5KGFyZ0NvdW50LHJhd0FyZ1R5cGVzQWRkcik7bmFtZT1yZWFkTGF0aW4xU3RyaW5nKG5hbWUpO3Jhd0ludm9rZXI9ZW1iaW5kX19yZXF1aXJlRnVuY3Rpb24oc2lnbmF0dXJlLHJhd0ludm9rZXIpO2V4cG9zZVB1YmxpY1N5bWJvbChuYW1lLGZ1bmN0aW9uKCl7dGhyb3dVbmJvdW5kVHlwZUVycm9yKCJDYW5ub3QgY2FsbCAiK25hbWUrIiBkdWUgdG8gdW5ib3VuZCB0eXBlcyIsYXJnVHlwZXMpO30sYXJnQ291bnQtMSk7d2hlbkRlcGVuZGVudFR5cGVzQXJlUmVzb2x2ZWQoW10sYXJnVHlwZXMsZnVuY3Rpb24oYXJnVHlwZXMpe3ZhciBpbnZva2VyQXJnc0FycmF5PVthcmdUeXBlc1swXSxudWxsXS5jb25jYXQoYXJnVHlwZXMuc2xpY2UoMSkpO3JlcGxhY2VQdWJsaWNTeW1ib2wobmFtZSxjcmFmdEludm9rZXJGdW5jdGlvbihuYW1lLGludm9rZXJBcmdzQXJyYXksbnVsbCxyYXdJbnZva2VyLGZuKSxhcmdDb3VudC0xKTtyZXR1cm4gW119KTt9ZnVuY3Rpb24gaW50ZWdlclJlYWRWYWx1ZUZyb21Qb2ludGVyKG5hbWUsc2hpZnQsc2lnbmVkKXtzd2l0Y2goc2hpZnQpe2Nhc2UgMDpyZXR1cm4gc2lnbmVkP2Z1bmN0aW9uIHJlYWRTOEZyb21Qb2ludGVyKHBvaW50ZXIpe3JldHVybiBIRUFQOFtwb2ludGVyXX06ZnVuY3Rpb24gcmVhZFU4RnJvbVBvaW50ZXIocG9pbnRlcil7cmV0dXJuIEhFQVBVOFtwb2ludGVyXX07Y2FzZSAxOnJldHVybiBzaWduZWQ/ZnVuY3Rpb24gcmVhZFMxNkZyb21Qb2ludGVyKHBvaW50ZXIpe3JldHVybiBIRUFQMTZbcG9pbnRlcj4+MV19OmZ1bmN0aW9uIHJlYWRVMTZGcm9tUG9pbnRlcihwb2ludGVyKXtyZXR1cm4gSEVBUFUxNltwb2ludGVyPj4xXX07Y2FzZSAyOnJldHVybiBzaWduZWQ/ZnVuY3Rpb24gcmVhZFMzMkZyb21Qb2ludGVyKHBvaW50ZXIpe3JldHVybiBIRUFQMzJbcG9pbnRlcj4+Ml19OmZ1bmN0aW9uIHJlYWRVMzJGcm9tUG9pbnRlcihwb2ludGVyKXtyZXR1cm4gSEVBUFUzMltwb2ludGVyPj4yXX07ZGVmYXVsdDp0aHJvdyBuZXcgVHlwZUVycm9yKCJVbmtub3duIGludGVnZXIgdHlwZTogIituYW1lKX19ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfaW50ZWdlcihwcmltaXRpdmVUeXBlLG5hbWUsc2l6ZSxtaW5SYW5nZSxtYXhSYW5nZSl7bmFtZT1yZWFkTGF0aW4xU3RyaW5nKG5hbWUpO3ZhciBzaGlmdD1nZXRTaGlmdEZyb21TaXplKHNpemUpO3ZhciBmcm9tV2lyZVR5cGU9dmFsdWU9PnZhbHVlO2lmKG1pblJhbmdlPT09MCl7dmFyIGJpdHNoaWZ0PTMyLTgqc2l6ZTtmcm9tV2lyZVR5cGU9dmFsdWU9PnZhbHVlPDxiaXRzaGlmdD4+PmJpdHNoaWZ0O312YXIgaXNVbnNpZ25lZFR5cGU9bmFtZS5pbmNsdWRlcygidW5zaWduZWQiKTt2YXIgY2hlY2tBc3NlcnRpb25zPSh2YWx1ZSx0b1R5cGVOYW1lKT0+e307dmFyIHRvV2lyZVR5cGU7aWYoaXNVbnNpZ25lZFR5cGUpe3RvV2lyZVR5cGU9ZnVuY3Rpb24oZGVzdHJ1Y3RvcnMsdmFsdWUpe2NoZWNrQXNzZXJ0aW9ucyh2YWx1ZSx0aGlzLm5hbWUpO3JldHVybiB2YWx1ZT4+PjB9O31lbHNlIHt0b1dpcmVUeXBlPWZ1bmN0aW9uKGRlc3RydWN0b3JzLHZhbHVlKXtjaGVja0Fzc2VydGlvbnModmFsdWUsdGhpcy5uYW1lKTtyZXR1cm4gdmFsdWV9O31yZWdpc3RlclR5cGUocHJpbWl0aXZlVHlwZSx7bmFtZTpuYW1lLCJmcm9tV2lyZVR5cGUiOmZyb21XaXJlVHlwZSwidG9XaXJlVHlwZSI6dG9XaXJlVHlwZSwiYXJnUGFja0FkdmFuY2UiOjgsInJlYWRWYWx1ZUZyb21Qb2ludGVyIjppbnRlZ2VyUmVhZFZhbHVlRnJvbVBvaW50ZXIobmFtZSxzaGlmdCxtaW5SYW5nZSE9PTApLGRlc3RydWN0b3JGdW5jdGlvbjpudWxsfSk7fWZ1bmN0aW9uIF9fZW1iaW5kX3JlZ2lzdGVyX21lbW9yeV92aWV3KHJhd1R5cGUsZGF0YVR5cGVJbmRleCxuYW1lKXt2YXIgdHlwZU1hcHBpbmc9W0ludDhBcnJheSxVaW50OEFycmF5LEludDE2QXJyYXksVWludDE2QXJyYXksSW50MzJBcnJheSxVaW50MzJBcnJheSxGbG9hdDMyQXJyYXksRmxvYXQ2NEFycmF5XTt2YXIgVEE9dHlwZU1hcHBpbmdbZGF0YVR5cGVJbmRleF07ZnVuY3Rpb24gZGVjb2RlTWVtb3J5VmlldyhoYW5kbGUpe2hhbmRsZT1oYW5kbGU+PjI7dmFyIGhlYXA9SEVBUFUzMjt2YXIgc2l6ZT1oZWFwW2hhbmRsZV07dmFyIGRhdGE9aGVhcFtoYW5kbGUrMV07cmV0dXJuIG5ldyBUQShidWZmZXIsZGF0YSxzaXplKX1uYW1lPXJlYWRMYXRpbjFTdHJpbmcobmFtZSk7cmVnaXN0ZXJUeXBlKHJhd1R5cGUse25hbWU6bmFtZSwiZnJvbVdpcmVUeXBlIjpkZWNvZGVNZW1vcnlWaWV3LCJhcmdQYWNrQWR2YW5jZSI6OCwicmVhZFZhbHVlRnJvbVBvaW50ZXIiOmRlY29kZU1lbW9yeVZpZXd9LHtpZ25vcmVEdXBsaWNhdGVSZWdpc3RyYXRpb25zOnRydWV9KTt9ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfc3RkX3N0cmluZyhyYXdUeXBlLG5hbWUpe25hbWU9cmVhZExhdGluMVN0cmluZyhuYW1lKTt2YXIgc3RkU3RyaW5nSXNVVEY4PW5hbWU9PT0ic3RkOjpzdHJpbmciO3JlZ2lzdGVyVHlwZShyYXdUeXBlLHtuYW1lOm5hbWUsImZyb21XaXJlVHlwZSI6ZnVuY3Rpb24odmFsdWUpe3ZhciBsZW5ndGg9SEVBUFUzMlt2YWx1ZT4+Ml07dmFyIHBheWxvYWQ9dmFsdWUrNDt2YXIgc3RyO2lmKHN0ZFN0cmluZ0lzVVRGOCl7dmFyIGRlY29kZVN0YXJ0UHRyPXBheWxvYWQ7Zm9yKHZhciBpPTA7aTw9bGVuZ3RoOysraSl7dmFyIGN1cnJlbnRCeXRlUHRyPXBheWxvYWQraTtpZihpPT1sZW5ndGh8fEhFQVBVOFtjdXJyZW50Qnl0ZVB0cl09PTApe3ZhciBtYXhSZWFkPWN1cnJlbnRCeXRlUHRyLWRlY29kZVN0YXJ0UHRyO3ZhciBzdHJpbmdTZWdtZW50PVVURjhUb1N0cmluZyhkZWNvZGVTdGFydFB0cixtYXhSZWFkKTtpZihzdHI9PT11bmRlZmluZWQpe3N0cj1zdHJpbmdTZWdtZW50O31lbHNlIHtzdHIrPVN0cmluZy5mcm9tQ2hhckNvZGUoMCk7c3RyKz1zdHJpbmdTZWdtZW50O31kZWNvZGVTdGFydFB0cj1jdXJyZW50Qnl0ZVB0cisxO319fWVsc2Uge3ZhciBhPW5ldyBBcnJheShsZW5ndGgpO2Zvcih2YXIgaT0wO2k8bGVuZ3RoOysraSl7YVtpXT1TdHJpbmcuZnJvbUNoYXJDb2RlKEhFQVBVOFtwYXlsb2FkK2ldKTt9c3RyPWEuam9pbigiIik7fV9mcmVlKHZhbHVlKTtyZXR1cm4gc3RyfSwidG9XaXJlVHlwZSI6ZnVuY3Rpb24oZGVzdHJ1Y3RvcnMsdmFsdWUpe2lmKHZhbHVlIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpe3ZhbHVlPW5ldyBVaW50OEFycmF5KHZhbHVlKTt9dmFyIGxlbmd0aDt2YXIgdmFsdWVJc09mVHlwZVN0cmluZz10eXBlb2YgdmFsdWU9PSJzdHJpbmciO2lmKCEodmFsdWVJc09mVHlwZVN0cmluZ3x8dmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5fHx2YWx1ZSBpbnN0YW5jZW9mIFVpbnQ4Q2xhbXBlZEFycmF5fHx2YWx1ZSBpbnN0YW5jZW9mIEludDhBcnJheSkpe3Rocm93QmluZGluZ0Vycm9yKCJDYW5ub3QgcGFzcyBub24tc3RyaW5nIHRvIHN0ZDo6c3RyaW5nIik7fWlmKHN0ZFN0cmluZ0lzVVRGOCYmdmFsdWVJc09mVHlwZVN0cmluZyl7bGVuZ3RoPWxlbmd0aEJ5dGVzVVRGOCh2YWx1ZSk7fWVsc2Uge2xlbmd0aD12YWx1ZS5sZW5ndGg7fXZhciBiYXNlPV9tYWxsb2MoNCtsZW5ndGgrMSk7dmFyIHB0cj1iYXNlKzQ7SEVBUFUzMltiYXNlPj4yXT1sZW5ndGg7aWYoc3RkU3RyaW5nSXNVVEY4JiZ2YWx1ZUlzT2ZUeXBlU3RyaW5nKXtzdHJpbmdUb1VURjgodmFsdWUscHRyLGxlbmd0aCsxKTt9ZWxzZSB7aWYodmFsdWVJc09mVHlwZVN0cmluZyl7Zm9yKHZhciBpPTA7aTxsZW5ndGg7KytpKXt2YXIgY2hhckNvZGU9dmFsdWUuY2hhckNvZGVBdChpKTtpZihjaGFyQ29kZT4yNTUpe19mcmVlKHB0cik7dGhyb3dCaW5kaW5nRXJyb3IoIlN0cmluZyBoYXMgVVRGLTE2IGNvZGUgdW5pdHMgdGhhdCBkbyBub3QgZml0IGluIDggYml0cyIpO31IRUFQVThbcHRyK2ldPWNoYXJDb2RlO319ZWxzZSB7Zm9yKHZhciBpPTA7aTxsZW5ndGg7KytpKXtIRUFQVThbcHRyK2ldPXZhbHVlW2ldO319fWlmKGRlc3RydWN0b3JzIT09bnVsbCl7ZGVzdHJ1Y3RvcnMucHVzaChfZnJlZSxiYXNlKTt9cmV0dXJuIGJhc2V9LCJhcmdQYWNrQWR2YW5jZSI6OCwicmVhZFZhbHVlRnJvbVBvaW50ZXIiOnNpbXBsZVJlYWRWYWx1ZUZyb21Qb2ludGVyLGRlc3RydWN0b3JGdW5jdGlvbjpmdW5jdGlvbihwdHIpe19mcmVlKHB0cik7fX0pO312YXIgVVRGMTZEZWNvZGVyPXR5cGVvZiBUZXh0RGVjb2RlciE9InVuZGVmaW5lZCI/bmV3IFRleHREZWNvZGVyKCJ1dGYtMTZsZSIpOnVuZGVmaW5lZDtmdW5jdGlvbiBVVEYxNlRvU3RyaW5nKHB0cixtYXhCeXRlc1RvUmVhZCl7dmFyIGVuZFB0cj1wdHI7dmFyIGlkeD1lbmRQdHI+PjE7dmFyIG1heElkeD1pZHgrbWF4Qnl0ZXNUb1JlYWQvMjt3aGlsZSghKGlkeD49bWF4SWR4KSYmSEVBUFUxNltpZHhdKSsraWR4O2VuZFB0cj1pZHg8PDE7aWYoZW5kUHRyLXB0cj4zMiYmVVRGMTZEZWNvZGVyKXJldHVybiBVVEYxNkRlY29kZXIuZGVjb2RlKEhFQVBVOC5zbGljZShwdHIsZW5kUHRyKSk7dmFyIHN0cj0iIjtmb3IodmFyIGk9MDshKGk+PW1heEJ5dGVzVG9SZWFkLzIpOysraSl7dmFyIGNvZGVVbml0PUhFQVAxNltwdHIraSoyPj4xXTtpZihjb2RlVW5pdD09MClicmVhaztzdHIrPVN0cmluZy5mcm9tQ2hhckNvZGUoY29kZVVuaXQpO31yZXR1cm4gc3RyfWZ1bmN0aW9uIHN0cmluZ1RvVVRGMTYoc3RyLG91dFB0cixtYXhCeXRlc1RvV3JpdGUpe2lmKG1heEJ5dGVzVG9Xcml0ZT09PXVuZGVmaW5lZCl7bWF4Qnl0ZXNUb1dyaXRlPTIxNDc0ODM2NDc7fWlmKG1heEJ5dGVzVG9Xcml0ZTwyKXJldHVybiAwO21heEJ5dGVzVG9Xcml0ZS09Mjt2YXIgc3RhcnRQdHI9b3V0UHRyO3ZhciBudW1DaGFyc1RvV3JpdGU9bWF4Qnl0ZXNUb1dyaXRlPHN0ci5sZW5ndGgqMj9tYXhCeXRlc1RvV3JpdGUvMjpzdHIubGVuZ3RoO2Zvcih2YXIgaT0wO2k8bnVtQ2hhcnNUb1dyaXRlOysraSl7dmFyIGNvZGVVbml0PXN0ci5jaGFyQ29kZUF0KGkpO0hFQVAxNltvdXRQdHI+PjFdPWNvZGVVbml0O291dFB0cis9Mjt9SEVBUDE2W291dFB0cj4+MV09MDtyZXR1cm4gb3V0UHRyLXN0YXJ0UHRyfWZ1bmN0aW9uIGxlbmd0aEJ5dGVzVVRGMTYoc3RyKXtyZXR1cm4gc3RyLmxlbmd0aCoyfWZ1bmN0aW9uIFVURjMyVG9TdHJpbmcocHRyLG1heEJ5dGVzVG9SZWFkKXt2YXIgaT0wO3ZhciBzdHI9IiI7d2hpbGUoIShpPj1tYXhCeXRlc1RvUmVhZC80KSl7dmFyIHV0ZjMyPUhFQVAzMltwdHIraSo0Pj4yXTtpZih1dGYzMj09MClicmVhazsrK2k7aWYodXRmMzI+PTY1NTM2KXt2YXIgY2g9dXRmMzItNjU1MzY7c3RyKz1TdHJpbmcuZnJvbUNoYXJDb2RlKDU1Mjk2fGNoPj4xMCw1NjMyMHxjaCYxMDIzKTt9ZWxzZSB7c3RyKz1TdHJpbmcuZnJvbUNoYXJDb2RlKHV0ZjMyKTt9fXJldHVybiBzdHJ9ZnVuY3Rpb24gc3RyaW5nVG9VVEYzMihzdHIsb3V0UHRyLG1heEJ5dGVzVG9Xcml0ZSl7aWYobWF4Qnl0ZXNUb1dyaXRlPT09dW5kZWZpbmVkKXttYXhCeXRlc1RvV3JpdGU9MjE0NzQ4MzY0Nzt9aWYobWF4Qnl0ZXNUb1dyaXRlPDQpcmV0dXJuIDA7dmFyIHN0YXJ0UHRyPW91dFB0cjt2YXIgZW5kUHRyPXN0YXJ0UHRyK21heEJ5dGVzVG9Xcml0ZS00O2Zvcih2YXIgaT0wO2k8c3RyLmxlbmd0aDsrK2kpe3ZhciBjb2RlVW5pdD1zdHIuY2hhckNvZGVBdChpKTtpZihjb2RlVW5pdD49NTUyOTYmJmNvZGVVbml0PD01NzM0Myl7dmFyIHRyYWlsU3Vycm9nYXRlPXN0ci5jaGFyQ29kZUF0KCsraSk7Y29kZVVuaXQ9NjU1MzYrKChjb2RlVW5pdCYxMDIzKTw8MTApfHRyYWlsU3Vycm9nYXRlJjEwMjM7fUhFQVAzMltvdXRQdHI+PjJdPWNvZGVVbml0O291dFB0cis9NDtpZihvdXRQdHIrND5lbmRQdHIpYnJlYWt9SEVBUDMyW291dFB0cj4+Ml09MDtyZXR1cm4gb3V0UHRyLXN0YXJ0UHRyfWZ1bmN0aW9uIGxlbmd0aEJ5dGVzVVRGMzIoc3RyKXt2YXIgbGVuPTA7Zm9yKHZhciBpPTA7aTxzdHIubGVuZ3RoOysraSl7dmFyIGNvZGVVbml0PXN0ci5jaGFyQ29kZUF0KGkpO2lmKGNvZGVVbml0Pj01NTI5NiYmY29kZVVuaXQ8PTU3MzQzKSsraTtsZW4rPTQ7fXJldHVybiBsZW59ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfc3RkX3dzdHJpbmcocmF3VHlwZSxjaGFyU2l6ZSxuYW1lKXtuYW1lPXJlYWRMYXRpbjFTdHJpbmcobmFtZSk7dmFyIGRlY29kZVN0cmluZyxlbmNvZGVTdHJpbmcsZ2V0SGVhcCxsZW5ndGhCeXRlc1VURixzaGlmdDtpZihjaGFyU2l6ZT09PTIpe2RlY29kZVN0cmluZz1VVEYxNlRvU3RyaW5nO2VuY29kZVN0cmluZz1zdHJpbmdUb1VURjE2O2xlbmd0aEJ5dGVzVVRGPWxlbmd0aEJ5dGVzVVRGMTY7Z2V0SGVhcD0oKT0+SEVBUFUxNjtzaGlmdD0xO31lbHNlIGlmKGNoYXJTaXplPT09NCl7ZGVjb2RlU3RyaW5nPVVURjMyVG9TdHJpbmc7ZW5jb2RlU3RyaW5nPXN0cmluZ1RvVVRGMzI7bGVuZ3RoQnl0ZXNVVEY9bGVuZ3RoQnl0ZXNVVEYzMjtnZXRIZWFwPSgpPT5IRUFQVTMyO3NoaWZ0PTI7fXJlZ2lzdGVyVHlwZShyYXdUeXBlLHtuYW1lOm5hbWUsImZyb21XaXJlVHlwZSI6ZnVuY3Rpb24odmFsdWUpe3ZhciBsZW5ndGg9SEVBUFUzMlt2YWx1ZT4+Ml07dmFyIEhFQVA9Z2V0SGVhcCgpO3ZhciBzdHI7dmFyIGRlY29kZVN0YXJ0UHRyPXZhbHVlKzQ7Zm9yKHZhciBpPTA7aTw9bGVuZ3RoOysraSl7dmFyIGN1cnJlbnRCeXRlUHRyPXZhbHVlKzQraSpjaGFyU2l6ZTtpZihpPT1sZW5ndGh8fEhFQVBbY3VycmVudEJ5dGVQdHI+PnNoaWZ0XT09MCl7dmFyIG1heFJlYWRCeXRlcz1jdXJyZW50Qnl0ZVB0ci1kZWNvZGVTdGFydFB0cjt2YXIgc3RyaW5nU2VnbWVudD1kZWNvZGVTdHJpbmcoZGVjb2RlU3RhcnRQdHIsbWF4UmVhZEJ5dGVzKTtpZihzdHI9PT11bmRlZmluZWQpe3N0cj1zdHJpbmdTZWdtZW50O31lbHNlIHtzdHIrPVN0cmluZy5mcm9tQ2hhckNvZGUoMCk7c3RyKz1zdHJpbmdTZWdtZW50O31kZWNvZGVTdGFydFB0cj1jdXJyZW50Qnl0ZVB0citjaGFyU2l6ZTt9fV9mcmVlKHZhbHVlKTtyZXR1cm4gc3RyfSwidG9XaXJlVHlwZSI6ZnVuY3Rpb24oZGVzdHJ1Y3RvcnMsdmFsdWUpe2lmKCEodHlwZW9mIHZhbHVlPT0ic3RyaW5nIikpe3Rocm93QmluZGluZ0Vycm9yKCJDYW5ub3QgcGFzcyBub24tc3RyaW5nIHRvIEMrKyBzdHJpbmcgdHlwZSAiK25hbWUpO312YXIgbGVuZ3RoPWxlbmd0aEJ5dGVzVVRGKHZhbHVlKTt2YXIgcHRyPV9tYWxsb2MoNCtsZW5ndGgrY2hhclNpemUpO0hFQVBVMzJbcHRyPj4yXT1sZW5ndGg+PnNoaWZ0O2VuY29kZVN0cmluZyh2YWx1ZSxwdHIrNCxsZW5ndGgrY2hhclNpemUpO2lmKGRlc3RydWN0b3JzIT09bnVsbCl7ZGVzdHJ1Y3RvcnMucHVzaChfZnJlZSxwdHIpO31yZXR1cm4gcHRyfSwiYXJnUGFja0FkdmFuY2UiOjgsInJlYWRWYWx1ZUZyb21Qb2ludGVyIjpzaW1wbGVSZWFkVmFsdWVGcm9tUG9pbnRlcixkZXN0cnVjdG9yRnVuY3Rpb246ZnVuY3Rpb24ocHRyKXtfZnJlZShwdHIpO319KTt9ZnVuY3Rpb24gX19lbWJpbmRfcmVnaXN0ZXJfdm9pZChyYXdUeXBlLG5hbWUpe25hbWU9cmVhZExhdGluMVN0cmluZyhuYW1lKTtyZWdpc3RlclR5cGUocmF3VHlwZSx7aXNWb2lkOnRydWUsbmFtZTpuYW1lLCJhcmdQYWNrQWR2YW5jZSI6MCwiZnJvbVdpcmVUeXBlIjpmdW5jdGlvbigpe3JldHVybiB1bmRlZmluZWR9LCJ0b1dpcmVUeXBlIjpmdW5jdGlvbihkZXN0cnVjdG9ycyxvKXtyZXR1cm4gdW5kZWZpbmVkfX0pO31mdW5jdGlvbiBfX2Vtc2NyaXB0ZW5fZGVmYXVsdF9wdGhyZWFkX3N0YWNrX3NpemUoKXtyZXR1cm4gMjA5NzE1Mn12YXIgbm93SXNNb25vdG9uaWM9dHJ1ZTtmdW5jdGlvbiBfX2Vtc2NyaXB0ZW5fZ2V0X25vd19pc19tb25vdG9uaWMoKXtyZXR1cm4gbm93SXNNb25vdG9uaWN9ZnVuY3Rpb24gZXhlY3V0ZU5vdGlmaWVkUHJveHlpbmdRdWV1ZShxdWV1ZSl7QXRvbWljcy5zdG9yZShIRUFQMzIscXVldWU+PjIsMSk7aWYoX3B0aHJlYWRfc2VsZigpKXtfX2Vtc2NyaXB0ZW5fcHJveHlfZXhlY3V0ZV90YXNrX3F1ZXVlKHF1ZXVlKTt9QXRvbWljcy5jb21wYXJlRXhjaGFuZ2UoSEVBUDMyLHF1ZXVlPj4yLDEsMCk7fU1vZHVsZVsiZXhlY3V0ZU5vdGlmaWVkUHJveHlpbmdRdWV1ZSJdPWV4ZWN1dGVOb3RpZmllZFByb3h5aW5nUXVldWU7ZnVuY3Rpb24gX19lbXNjcmlwdGVuX25vdGlmeV90YXNrX3F1ZXVlKHRhcmdldFRocmVhZElkLGN1cnJUaHJlYWRJZCxtYWluVGhyZWFkSWQscXVldWUpe2lmKHRhcmdldFRocmVhZElkPT1jdXJyVGhyZWFkSWQpe3NldFRpbWVvdXQoKCk9PmV4ZWN1dGVOb3RpZmllZFByb3h5aW5nUXVldWUocXVldWUpKTt9ZWxzZSBpZihFTlZJUk9OTUVOVF9JU19QVEhSRUFEKXtwb3N0TWVzc2FnZSh7InRhcmdldFRocmVhZCI6dGFyZ2V0VGhyZWFkSWQsImNtZCI6InByb2Nlc3NQcm94eWluZ1F1ZXVlIiwicXVldWUiOnF1ZXVlfSk7fWVsc2Uge3ZhciB3b3JrZXI9UFRocmVhZC5wdGhyZWFkc1t0YXJnZXRUaHJlYWRJZF07aWYoIXdvcmtlcil7cmV0dXJufXdvcmtlci5wb3N0TWVzc2FnZSh7ImNtZCI6InByb2Nlc3NQcm94eWluZ1F1ZXVlIiwicXVldWUiOnF1ZXVlfSk7fXJldHVybiAxfWZ1bmN0aW9uIF9fZW1zY3JpcHRlbl9zZXRfb2Zmc2NyZWVuY2FudmFzX3NpemUodGFyZ2V0LHdpZHRoLGhlaWdodCl7cmV0dXJuIC0xfXZhciBlbXZhbF9zeW1ib2xzPXt9O2Z1bmN0aW9uIGdldFN0cmluZ09yU3ltYm9sKGFkZHJlc3Mpe3ZhciBzeW1ib2w9ZW12YWxfc3ltYm9sc1thZGRyZXNzXTtpZihzeW1ib2w9PT11bmRlZmluZWQpe3JldHVybiByZWFkTGF0aW4xU3RyaW5nKGFkZHJlc3MpfXJldHVybiBzeW1ib2x9dmFyIGVtdmFsX21ldGhvZENhbGxlcnM9W107ZnVuY3Rpb24gX19lbXZhbF9jYWxsX3ZvaWRfbWV0aG9kKGNhbGxlcixoYW5kbGUsbWV0aG9kTmFtZSxhcmdzKXtjYWxsZXI9ZW12YWxfbWV0aG9kQ2FsbGVyc1tjYWxsZXJdO2hhbmRsZT1FbXZhbC50b1ZhbHVlKGhhbmRsZSk7bWV0aG9kTmFtZT1nZXRTdHJpbmdPclN5bWJvbChtZXRob2ROYW1lKTtjYWxsZXIoaGFuZGxlLG1ldGhvZE5hbWUsbnVsbCxhcmdzKTt9ZnVuY3Rpb24gZW12YWxfYWRkTWV0aG9kQ2FsbGVyKGNhbGxlcil7dmFyIGlkPWVtdmFsX21ldGhvZENhbGxlcnMubGVuZ3RoO2VtdmFsX21ldGhvZENhbGxlcnMucHVzaChjYWxsZXIpO3JldHVybiBpZH1mdW5jdGlvbiByZXF1aXJlUmVnaXN0ZXJlZFR5cGUocmF3VHlwZSxodW1hbk5hbWUpe3ZhciBpbXBsPXJlZ2lzdGVyZWRUeXBlc1tyYXdUeXBlXTtpZih1bmRlZmluZWQ9PT1pbXBsKXt0aHJvd0JpbmRpbmdFcnJvcihodW1hbk5hbWUrIiBoYXMgdW5rbm93biB0eXBlICIrZ2V0VHlwZU5hbWUocmF3VHlwZSkpO31yZXR1cm4gaW1wbH1mdW5jdGlvbiBlbXZhbF9sb29rdXBUeXBlcyhhcmdDb3VudCxhcmdUeXBlcyl7dmFyIGE9bmV3IEFycmF5KGFyZ0NvdW50KTtmb3IodmFyIGk9MDtpPGFyZ0NvdW50OysraSl7YVtpXT1yZXF1aXJlUmVnaXN0ZXJlZFR5cGUoSEVBUFUzMlthcmdUeXBlcytpKlBPSU5URVJfU0laRT4+Ml0sInBhcmFtZXRlciAiK2kpO31yZXR1cm4gYX12YXIgZW12YWxfcmVnaXN0ZXJlZE1ldGhvZHM9W107ZnVuY3Rpb24gX19lbXZhbF9nZXRfbWV0aG9kX2NhbGxlcihhcmdDb3VudCxhcmdUeXBlcyl7dmFyIHR5cGVzPWVtdmFsX2xvb2t1cFR5cGVzKGFyZ0NvdW50LGFyZ1R5cGVzKTt2YXIgcmV0VHlwZT10eXBlc1swXTt2YXIgc2lnbmF0dXJlTmFtZT1yZXRUeXBlLm5hbWUrIl8kIit0eXBlcy5zbGljZSgxKS5tYXAoZnVuY3Rpb24odCl7cmV0dXJuIHQubmFtZX0pLmpvaW4oIl8iKSsiJCI7dmFyIHJldHVybklkPWVtdmFsX3JlZ2lzdGVyZWRNZXRob2RzW3NpZ25hdHVyZU5hbWVdO2lmKHJldHVybklkIT09dW5kZWZpbmVkKXtyZXR1cm4gcmV0dXJuSWR9dmFyIHBhcmFtcz1bInJldFR5cGUiXTt2YXIgYXJncz1bcmV0VHlwZV07dmFyIGFyZ3NMaXN0PSIiO2Zvcih2YXIgaT0wO2k8YXJnQ291bnQtMTsrK2kpe2FyZ3NMaXN0Kz0oaSE9PTA/IiwgIjoiIikrImFyZyIraTtwYXJhbXMucHVzaCgiYXJnVHlwZSIraSk7YXJncy5wdXNoKHR5cGVzWzEraV0pO312YXIgZnVuY3Rpb25OYW1lPW1ha2VMZWdhbEZ1bmN0aW9uTmFtZSgibWV0aG9kQ2FsbGVyXyIrc2lnbmF0dXJlTmFtZSk7dmFyIGZ1bmN0aW9uQm9keT0icmV0dXJuIGZ1bmN0aW9uICIrZnVuY3Rpb25OYW1lKyIoaGFuZGxlLCBuYW1lLCBkZXN0cnVjdG9ycywgYXJncykge1xuIjt2YXIgb2Zmc2V0PTA7Zm9yKHZhciBpPTA7aTxhcmdDb3VudC0xOysraSl7ZnVuY3Rpb25Cb2R5Kz0iICAgIHZhciBhcmciK2krIiA9IGFyZ1R5cGUiK2krIi5yZWFkVmFsdWVGcm9tUG9pbnRlcihhcmdzIisob2Zmc2V0PyIrIitvZmZzZXQ6IiIpKyIpO1xuIjtvZmZzZXQrPXR5cGVzW2krMV1bImFyZ1BhY2tBZHZhbmNlIl07fWZ1bmN0aW9uQm9keSs9IiAgICB2YXIgcnYgPSBoYW5kbGVbbmFtZV0oIithcmdzTGlzdCsiKTtcbiI7Zm9yKHZhciBpPTA7aTxhcmdDb3VudC0xOysraSl7aWYodHlwZXNbaSsxXVsiZGVsZXRlT2JqZWN0Il0pe2Z1bmN0aW9uQm9keSs9IiAgICBhcmdUeXBlIitpKyIuZGVsZXRlT2JqZWN0KGFyZyIraSsiKTtcbiI7fX1pZighcmV0VHlwZS5pc1ZvaWQpe2Z1bmN0aW9uQm9keSs9IiAgICByZXR1cm4gcmV0VHlwZS50b1dpcmVUeXBlKGRlc3RydWN0b3JzLCBydik7XG4iO31mdW5jdGlvbkJvZHkrPSJ9O1xuIjtwYXJhbXMucHVzaChmdW5jdGlvbkJvZHkpO3ZhciBpbnZva2VyRnVuY3Rpb249bmV3XyhGdW5jdGlvbixwYXJhbXMpLmFwcGx5KG51bGwsYXJncyk7cmV0dXJuSWQ9ZW12YWxfYWRkTWV0aG9kQ2FsbGVyKGludm9rZXJGdW5jdGlvbik7ZW12YWxfcmVnaXN0ZXJlZE1ldGhvZHNbc2lnbmF0dXJlTmFtZV09cmV0dXJuSWQ7cmV0dXJuIHJldHVybklkfWZ1bmN0aW9uIF9fZW12YWxfaW5jcmVmKGhhbmRsZSl7aWYoaGFuZGxlPjQpe2VtdmFsX2hhbmRsZV9hcnJheVtoYW5kbGVdLnJlZmNvdW50Kz0xO319ZnVuY3Rpb24gX19lbXZhbF90YWtlX3ZhbHVlKHR5cGUsYXJnKXt0eXBlPXJlcXVpcmVSZWdpc3RlcmVkVHlwZSh0eXBlLCJfZW12YWxfdGFrZV92YWx1ZSIpO3ZhciB2PXR5cGVbInJlYWRWYWx1ZUZyb21Qb2ludGVyIl0oYXJnKTtyZXR1cm4gRW12YWwudG9IYW5kbGUodil9ZnVuY3Rpb24gcmVhZEk1M0Zyb21JNjQocHRyKXtyZXR1cm4gSEVBUFUzMltwdHI+PjJdK0hFQVAzMltwdHIrND4+Ml0qNDI5NDk2NzI5Nn1mdW5jdGlvbiBfX2dtdGltZV9qcyh0aW1lLHRtUHRyKXt2YXIgZGF0ZT1uZXcgRGF0ZShyZWFkSTUzRnJvbUk2NCh0aW1lKSoxZTMpO0hFQVAzMlt0bVB0cj4+Ml09ZGF0ZS5nZXRVVENTZWNvbmRzKCk7SEVBUDMyW3RtUHRyKzQ+PjJdPWRhdGUuZ2V0VVRDTWludXRlcygpO0hFQVAzMlt0bVB0cis4Pj4yXT1kYXRlLmdldFVUQ0hvdXJzKCk7SEVBUDMyW3RtUHRyKzEyPj4yXT1kYXRlLmdldFVUQ0RhdGUoKTtIRUFQMzJbdG1QdHIrMTY+PjJdPWRhdGUuZ2V0VVRDTW9udGgoKTtIRUFQMzJbdG1QdHIrMjA+PjJdPWRhdGUuZ2V0VVRDRnVsbFllYXIoKS0xOTAwO0hFQVAzMlt0bVB0cisyND4+Ml09ZGF0ZS5nZXRVVENEYXkoKTt2YXIgc3RhcnQ9RGF0ZS5VVEMoZGF0ZS5nZXRVVENGdWxsWWVhcigpLDAsMSwwLDAsMCwwKTt2YXIgeWRheT0oZGF0ZS5nZXRUaW1lKCktc3RhcnQpLygxZTMqNjAqNjAqMjQpfDA7SEVBUDMyW3RtUHRyKzI4Pj4yXT15ZGF5O31mdW5jdGlvbiBfX2lzTGVhcFllYXIoeWVhcil7cmV0dXJuIHllYXIlND09PTAmJih5ZWFyJTEwMCE9PTB8fHllYXIlNDAwPT09MCl9dmFyIF9fTU9OVEhfREFZU19MRUFQX0NVTVVMQVRJVkU9WzAsMzEsNjAsOTEsMTIxLDE1MiwxODIsMjEzLDI0NCwyNzQsMzA1LDMzNV07dmFyIF9fTU9OVEhfREFZU19SRUdVTEFSX0NVTVVMQVRJVkU9WzAsMzEsNTksOTAsMTIwLDE1MSwxODEsMjEyLDI0MywyNzMsMzA0LDMzNF07ZnVuY3Rpb24gX195ZGF5X2Zyb21fZGF0ZShkYXRlKXt2YXIgaXNMZWFwWWVhcj1fX2lzTGVhcFllYXIoZGF0ZS5nZXRGdWxsWWVhcigpKTt2YXIgbW9udGhEYXlzQ3VtdWxhdGl2ZT1pc0xlYXBZZWFyP19fTU9OVEhfREFZU19MRUFQX0NVTVVMQVRJVkU6X19NT05USF9EQVlTX1JFR1VMQVJfQ1VNVUxBVElWRTt2YXIgeWRheT1tb250aERheXNDdW11bGF0aXZlW2RhdGUuZ2V0TW9udGgoKV0rZGF0ZS5nZXREYXRlKCktMTtyZXR1cm4geWRheX1mdW5jdGlvbiBfX2xvY2FsdGltZV9qcyh0aW1lLHRtUHRyKXt2YXIgZGF0ZT1uZXcgRGF0ZShyZWFkSTUzRnJvbUk2NCh0aW1lKSoxZTMpO0hFQVAzMlt0bVB0cj4+Ml09ZGF0ZS5nZXRTZWNvbmRzKCk7SEVBUDMyW3RtUHRyKzQ+PjJdPWRhdGUuZ2V0TWludXRlcygpO0hFQVAzMlt0bVB0cis4Pj4yXT1kYXRlLmdldEhvdXJzKCk7SEVBUDMyW3RtUHRyKzEyPj4yXT1kYXRlLmdldERhdGUoKTtIRUFQMzJbdG1QdHIrMTY+PjJdPWRhdGUuZ2V0TW9udGgoKTtIRUFQMzJbdG1QdHIrMjA+PjJdPWRhdGUuZ2V0RnVsbFllYXIoKS0xOTAwO0hFQVAzMlt0bVB0cisyND4+Ml09ZGF0ZS5nZXREYXkoKTt2YXIgeWRheT1fX3lkYXlfZnJvbV9kYXRlKGRhdGUpfDA7SEVBUDMyW3RtUHRyKzI4Pj4yXT15ZGF5O0hFQVAzMlt0bVB0ciszNj4+Ml09LShkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCkqNjApO3ZhciBzdGFydD1uZXcgRGF0ZShkYXRlLmdldEZ1bGxZZWFyKCksMCwxKTt2YXIgc3VtbWVyT2Zmc2V0PW5ldyBEYXRlKGRhdGUuZ2V0RnVsbFllYXIoKSw2LDEpLmdldFRpbWV6b25lT2Zmc2V0KCk7dmFyIHdpbnRlck9mZnNldD1zdGFydC5nZXRUaW1lem9uZU9mZnNldCgpO3ZhciBkc3Q9KHN1bW1lck9mZnNldCE9d2ludGVyT2Zmc2V0JiZkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk9PU1hdGgubWluKHdpbnRlck9mZnNldCxzdW1tZXJPZmZzZXQpKXwwO0hFQVAzMlt0bVB0ciszMj4+Ml09ZHN0O31mdW5jdGlvbiBfX21rdGltZV9qcyh0bVB0cil7dmFyIGRhdGU9bmV3IERhdGUoSEVBUDMyW3RtUHRyKzIwPj4yXSsxOTAwLEhFQVAzMlt0bVB0cisxNj4+Ml0sSEVBUDMyW3RtUHRyKzEyPj4yXSxIRUFQMzJbdG1QdHIrOD4+Ml0sSEVBUDMyW3RtUHRyKzQ+PjJdLEhFQVAzMlt0bVB0cj4+Ml0sMCk7dmFyIGRzdD1IRUFQMzJbdG1QdHIrMzI+PjJdO3ZhciBndWVzc2VkT2Zmc2V0PWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTt2YXIgc3RhcnQ9bmV3IERhdGUoZGF0ZS5nZXRGdWxsWWVhcigpLDAsMSk7dmFyIHN1bW1lck9mZnNldD1uZXcgRGF0ZShkYXRlLmdldEZ1bGxZZWFyKCksNiwxKS5nZXRUaW1lem9uZU9mZnNldCgpO3ZhciB3aW50ZXJPZmZzZXQ9c3RhcnQuZ2V0VGltZXpvbmVPZmZzZXQoKTt2YXIgZHN0T2Zmc2V0PU1hdGgubWluKHdpbnRlck9mZnNldCxzdW1tZXJPZmZzZXQpO2lmKGRzdDwwKXtIRUFQMzJbdG1QdHIrMzI+PjJdPU51bWJlcihzdW1tZXJPZmZzZXQhPXdpbnRlck9mZnNldCYmZHN0T2Zmc2V0PT1ndWVzc2VkT2Zmc2V0KTt9ZWxzZSBpZihkc3Q+MCE9KGRzdE9mZnNldD09Z3Vlc3NlZE9mZnNldCkpe3ZhciBub25Ec3RPZmZzZXQ9TWF0aC5tYXgod2ludGVyT2Zmc2V0LHN1bW1lck9mZnNldCk7dmFyIHRydWVPZmZzZXQ9ZHN0PjA/ZHN0T2Zmc2V0Om5vbkRzdE9mZnNldDtkYXRlLnNldFRpbWUoZGF0ZS5nZXRUaW1lKCkrKHRydWVPZmZzZXQtZ3Vlc3NlZE9mZnNldCkqNmU0KTt9SEVBUDMyW3RtUHRyKzI0Pj4yXT1kYXRlLmdldERheSgpO3ZhciB5ZGF5PV9feWRheV9mcm9tX2RhdGUoZGF0ZSl8MDtIRUFQMzJbdG1QdHIrMjg+PjJdPXlkYXk7SEVBUDMyW3RtUHRyPj4yXT1kYXRlLmdldFNlY29uZHMoKTtIRUFQMzJbdG1QdHIrND4+Ml09ZGF0ZS5nZXRNaW51dGVzKCk7SEVBUDMyW3RtUHRyKzg+PjJdPWRhdGUuZ2V0SG91cnMoKTtIRUFQMzJbdG1QdHIrMTI+PjJdPWRhdGUuZ2V0RGF0ZSgpO0hFQVAzMlt0bVB0cisxNj4+Ml09ZGF0ZS5nZXRNb250aCgpO0hFQVAzMlt0bVB0cisyMD4+Ml09ZGF0ZS5nZXRZZWFyKCk7cmV0dXJuIGRhdGUuZ2V0VGltZSgpLzFlM3wwfWZ1bmN0aW9uIF9fbW1hcF9qcyhsZW4scHJvdCxmbGFncyxmZCxvZmYsYWxsb2NhdGVkLGFkZHIpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDEzLDEsbGVuLHByb3QsZmxhZ3MsZmQsb2ZmLGFsbG9jYXRlZCxhZGRyKTt0cnl7dmFyIHN0cmVhbT1TWVNDQUxMUy5nZXRTdHJlYW1Gcm9tRkQoZmQpO3ZhciByZXM9RlMubW1hcChzdHJlYW0sbGVuLG9mZixwcm90LGZsYWdzKTt2YXIgcHRyPXJlcy5wdHI7SEVBUDMyW2FsbG9jYXRlZD4+Ml09cmVzLmFsbG9jYXRlZDtIRUFQVTMyW2FkZHI+PjJdPXB0cjtyZXR1cm4gMH1jYXRjaChlKXtpZih0eXBlb2YgRlM9PSJ1bmRlZmluZWQifHwhKGUgaW5zdGFuY2VvZiBGUy5FcnJub0Vycm9yKSl0aHJvdyBlO3JldHVybiAtZS5lcnJub319ZnVuY3Rpb24gX19tdW5tYXBfanMoYWRkcixsZW4scHJvdCxmbGFncyxmZCxvZmZzZXQpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDE0LDEsYWRkcixsZW4scHJvdCxmbGFncyxmZCxvZmZzZXQpO3RyeXt2YXIgc3RyZWFtPVNZU0NBTExTLmdldFN0cmVhbUZyb21GRChmZCk7aWYocHJvdCYyKXtTWVNDQUxMUy5kb01zeW5jKGFkZHIsc3RyZWFtLGxlbixmbGFncyxvZmZzZXQpO31GUy5tdW5tYXAoc3RyZWFtKTt9Y2F0Y2goZSl7aWYodHlwZW9mIEZTPT0idW5kZWZpbmVkInx8IShlIGluc3RhbmNlb2YgRlMuRXJybm9FcnJvcikpdGhyb3cgZTtyZXR1cm4gLWUuZXJybm99fWZ1bmN0aW9uIGFsbG9jYXRlVVRGOChzdHIpe3ZhciBzaXplPWxlbmd0aEJ5dGVzVVRGOChzdHIpKzE7dmFyIHJldD1fbWFsbG9jKHNpemUpO2lmKHJldClzdHJpbmdUb1VURjhBcnJheShzdHIsSEVBUDgscmV0LHNpemUpO3JldHVybiByZXR9ZnVuY3Rpb24gX190enNldF9qcyh0aW1lem9uZSxkYXlsaWdodCx0em5hbWUpe3ZhciBjdXJyZW50WWVhcj0obmV3IERhdGUpLmdldEZ1bGxZZWFyKCk7dmFyIHdpbnRlcj1uZXcgRGF0ZShjdXJyZW50WWVhciwwLDEpO3ZhciBzdW1tZXI9bmV3IERhdGUoY3VycmVudFllYXIsNiwxKTt2YXIgd2ludGVyT2Zmc2V0PXdpbnRlci5nZXRUaW1lem9uZU9mZnNldCgpO3ZhciBzdW1tZXJPZmZzZXQ9c3VtbWVyLmdldFRpbWV6b25lT2Zmc2V0KCk7dmFyIHN0ZFRpbWV6b25lT2Zmc2V0PU1hdGgubWF4KHdpbnRlck9mZnNldCxzdW1tZXJPZmZzZXQpO0hFQVBVMzJbdGltZXpvbmU+PjJdPXN0ZFRpbWV6b25lT2Zmc2V0KjYwO0hFQVAzMltkYXlsaWdodD4+Ml09TnVtYmVyKHdpbnRlck9mZnNldCE9c3VtbWVyT2Zmc2V0KTtmdW5jdGlvbiBleHRyYWN0Wm9uZShkYXRlKXt2YXIgbWF0Y2g9ZGF0ZS50b1RpbWVTdHJpbmcoKS5tYXRjaCgvXCgoW0EtWmEteiBdKylcKSQvKTtyZXR1cm4gbWF0Y2g/bWF0Y2hbMV06IkdNVCJ9dmFyIHdpbnRlck5hbWU9ZXh0cmFjdFpvbmUod2ludGVyKTt2YXIgc3VtbWVyTmFtZT1leHRyYWN0Wm9uZShzdW1tZXIpO3ZhciB3aW50ZXJOYW1lUHRyPWFsbG9jYXRlVVRGOCh3aW50ZXJOYW1lKTt2YXIgc3VtbWVyTmFtZVB0cj1hbGxvY2F0ZVVURjgoc3VtbWVyTmFtZSk7aWYoc3VtbWVyT2Zmc2V0PHdpbnRlck9mZnNldCl7SEVBUFUzMlt0em5hbWU+PjJdPXdpbnRlck5hbWVQdHI7SEVBUFUzMlt0em5hbWUrND4+Ml09c3VtbWVyTmFtZVB0cjt9ZWxzZSB7SEVBUFUzMlt0em5hbWU+PjJdPXN1bW1lck5hbWVQdHI7SEVBUFUzMlt0em5hbWUrND4+Ml09d2ludGVyTmFtZVB0cjt9fWZ1bmN0aW9uIF9hYm9ydCgpe2Fib3J0KCIiKTt9dmFyIHJlYWRBc21Db25zdEFyZ3NBcnJheT1bXTtmdW5jdGlvbiByZWFkQXNtQ29uc3RBcmdzKHNpZ1B0cixidWYpe3JlYWRBc21Db25zdEFyZ3NBcnJheS5sZW5ndGg9MDt2YXIgY2g7YnVmPj49Mjt3aGlsZShjaD1IRUFQVThbc2lnUHRyKytdKXtidWYrPWNoIT0xMDUmYnVmO3JlYWRBc21Db25zdEFyZ3NBcnJheS5wdXNoKGNoPT0xMDU/SEVBUDMyW2J1Zl06SEVBUEY2NFtidWYrKz4+MV0pOysrYnVmO31yZXR1cm4gcmVhZEFzbUNvbnN0QXJnc0FycmF5fWZ1bmN0aW9uIF9lbXNjcmlwdGVuX2FzbV9jb25zdF9pbnQoY29kZSxzaWdQdHIsYXJnYnVmKXt2YXIgYXJncz1yZWFkQXNtQ29uc3RBcmdzKHNpZ1B0cixhcmdidWYpO3JldHVybiBBU01fQ09OU1RTW2NvZGVdLmFwcGx5KG51bGwsYXJncyl9ZnVuY3Rpb24gX2Vtc2NyaXB0ZW5fY2hlY2tfYmxvY2tpbmdfYWxsb3dlZCgpe2lmKEVOVklST05NRU5UX0lTX05PREUpcmV0dXJuO2lmKEVOVklST05NRU5UX0lTX1dPUktFUilyZXR1cm47d2Fybk9uY2UoIkJsb2NraW5nIG9uIHRoZSBtYWluIHRocmVhZCBpcyB2ZXJ5IGRhbmdlcm91cywgc2VlIGh0dHBzOi8vZW1zY3JpcHRlbi5vcmcvZG9jcy9wb3J0aW5nL3B0aHJlYWRzLmh0bWwjYmxvY2tpbmctb24tdGhlLW1haW4tYnJvd3Nlci10aHJlYWQiKTt9ZnVuY3Rpb24gX2Vtc2NyaXB0ZW5fZGF0ZV9ub3coKXtyZXR1cm4gRGF0ZS5ub3coKX1mdW5jdGlvbiBnZXRIZWFwTWF4KCl7cmV0dXJuIEhFQVBVOC5sZW5ndGh9ZnVuY3Rpb24gX2Vtc2NyaXB0ZW5fZ2V0X2hlYXBfbWF4KCl7cmV0dXJuIGdldEhlYXBNYXgoKX12YXIgX2Vtc2NyaXB0ZW5fZ2V0X25vdztpZihFTlZJUk9OTUVOVF9JU19OT0RFKXtfZW1zY3JpcHRlbl9nZXRfbm93PSgpPT57dmFyIHQ9cHJvY2Vzc1siaHJ0aW1lIl0oKTtyZXR1cm4gdFswXSoxZTMrdFsxXS8xZTZ9O31lbHNlIGlmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpe19lbXNjcmlwdGVuX2dldF9ub3c9KCk9PnBlcmZvcm1hbmNlLm5vdygpLU1vZHVsZVsiX19wZXJmb3JtYW5jZV9ub3dfY2xvY2tfZHJpZnQiXTt9ZWxzZSBfZW1zY3JpcHRlbl9nZXRfbm93PSgpPT5wZXJmb3JtYW5jZS5ub3coKTtmdW5jdGlvbiBfZW1zY3JpcHRlbl9tZW1jcHlfYmlnKGRlc3Qsc3JjLG51bSl7SEVBUFU4LmNvcHlXaXRoaW4oZGVzdCxzcmMsc3JjK251bSk7fWZ1bmN0aW9uIF9lbXNjcmlwdGVuX251bV9sb2dpY2FsX2NvcmVzKCl7aWYoRU5WSVJPTk1FTlRfSVNfTk9ERSlyZXR1cm4gcmVxdWlyZSgib3MiKS5jcHVzKCkubGVuZ3RoO3JldHVybiBuYXZpZ2F0b3JbImhhcmR3YXJlQ29uY3VycmVuY3kiXX1mdW5jdGlvbiB3aXRoU3RhY2tTYXZlKGYpe3ZhciBzdGFjaz1zdGFja1NhdmUoKTt2YXIgcmV0PWYoKTtzdGFja1Jlc3RvcmUoc3RhY2spO3JldHVybiByZXR9ZnVuY3Rpb24gX2Vtc2NyaXB0ZW5fcHJveHlfdG9fbWFpbl90aHJlYWRfanMoaW5kZXgsc3luYyl7dmFyIG51bUNhbGxBcmdzPWFyZ3VtZW50cy5sZW5ndGgtMjt2YXIgb3V0ZXJBcmdzPWFyZ3VtZW50cztyZXR1cm4gd2l0aFN0YWNrU2F2ZSgoKT0+e3ZhciBzZXJpYWxpemVkTnVtQ2FsbEFyZ3M9bnVtQ2FsbEFyZ3M7dmFyIGFyZ3M9c3RhY2tBbGxvYyhzZXJpYWxpemVkTnVtQ2FsbEFyZ3MqOCk7dmFyIGI9YXJncz4+Mztmb3IodmFyIGk9MDtpPG51bUNhbGxBcmdzO2krKyl7dmFyIGFyZz1vdXRlckFyZ3NbMitpXTtIRUFQRjY0W2IraV09YXJnO31yZXR1cm4gX2Vtc2NyaXB0ZW5fcnVuX2luX21haW5fcnVudGltZV90aHJlYWRfanMoaW5kZXgsc2VyaWFsaXplZE51bUNhbGxBcmdzLGFyZ3Msc3luYyl9KX12YXIgX2Vtc2NyaXB0ZW5fcmVjZWl2ZV9vbl9tYWluX3RocmVhZF9qc19jYWxsQXJncz1bXTtmdW5jdGlvbiBfZW1zY3JpcHRlbl9yZWNlaXZlX29uX21haW5fdGhyZWFkX2pzKGluZGV4LG51bUNhbGxBcmdzLGFyZ3Mpe19lbXNjcmlwdGVuX3JlY2VpdmVfb25fbWFpbl90aHJlYWRfanNfY2FsbEFyZ3MubGVuZ3RoPW51bUNhbGxBcmdzO3ZhciBiPWFyZ3M+PjM7Zm9yKHZhciBpPTA7aTxudW1DYWxsQXJncztpKyspe19lbXNjcmlwdGVuX3JlY2VpdmVfb25fbWFpbl90aHJlYWRfanNfY2FsbEFyZ3NbaV09SEVBUEY2NFtiK2ldO312YXIgaXNFbUFzbUNvbnN0PWluZGV4PDA7dmFyIGZ1bmM9IWlzRW1Bc21Db25zdD9wcm94aWVkRnVuY3Rpb25UYWJsZVtpbmRleF06QVNNX0NPTlNUU1staW5kZXgtMV07cmV0dXJuIGZ1bmMuYXBwbHkobnVsbCxfZW1zY3JpcHRlbl9yZWNlaXZlX29uX21haW5fdGhyZWFkX2pzX2NhbGxBcmdzKX1mdW5jdGlvbiBhYm9ydE9uQ2Fubm90R3Jvd01lbW9yeShyZXF1ZXN0ZWRTaXplKXthYm9ydCgiT09NIik7fWZ1bmN0aW9uIF9lbXNjcmlwdGVuX3Jlc2l6ZV9oZWFwKHJlcXVlc3RlZFNpemUpe0hFQVBVOC5sZW5ndGg7YWJvcnRPbkNhbm5vdEdyb3dNZW1vcnkoKTt9ZnVuY3Rpb24gY29udmVydEZyYW1lVG9QQyhmcmFtZSl7YWJvcnQoIkNhbm5vdCB1c2UgY29udmVydEZyYW1lVG9QQyAobmVlZGVkIGJ5IF9fYnVpbHRpbl9yZXR1cm5fYWRkcmVzcykgd2l0aG91dCAtc1VTRV9PRkZTRVRfQ09OVkVSVEVSIik7cmV0dXJuIDB9dmFyIFVOV0lORF9DQUNIRT17fTtmdW5jdGlvbiBzYXZlSW5VbndpbmRDYWNoZShjYWxsc3RhY2spe2NhbGxzdGFjay5mb3JFYWNoKGZyYW1lPT57Y29udmVydEZyYW1lVG9QQygpO30pO31mdW5jdGlvbiBfZW1zY3JpcHRlbl9zdGFja19zbmFwc2hvdCgpe3ZhciBjYWxsc3RhY2s9anNTdGFja1RyYWNlKCkuc3BsaXQoIlxuIik7aWYoY2FsbHN0YWNrWzBdPT0iRXJyb3IiKXtjYWxsc3RhY2suc2hpZnQoKTt9c2F2ZUluVW53aW5kQ2FjaGUoY2FsbHN0YWNrKTtVTldJTkRfQ0FDSEUubGFzdF9hZGRyPWNvbnZlcnRGcmFtZVRvUEMoY2FsbHN0YWNrWzNdKTtVTldJTkRfQ0FDSEUubGFzdF9zdGFjaz1jYWxsc3RhY2s7cmV0dXJuIFVOV0lORF9DQUNIRS5sYXN0X2FkZHJ9ZnVuY3Rpb24gX2Vtc2NyaXB0ZW5fc3RhY2tfdW53aW5kX2J1ZmZlcihhZGRyLGJ1ZmZlcixjb3VudCl7dmFyIHN0YWNrO2lmKFVOV0lORF9DQUNIRS5sYXN0X2FkZHI9PWFkZHIpe3N0YWNrPVVOV0lORF9DQUNIRS5sYXN0X3N0YWNrO31lbHNlIHtzdGFjaz1qc1N0YWNrVHJhY2UoKS5zcGxpdCgiXG4iKTtpZihzdGFja1swXT09IkVycm9yIil7c3RhY2suc2hpZnQoKTt9c2F2ZUluVW53aW5kQ2FjaGUoc3RhY2spO312YXIgb2Zmc2V0PTM7d2hpbGUoc3RhY2tbb2Zmc2V0XSYmY29udmVydEZyYW1lVG9QQyhzdGFja1tvZmZzZXRdKSE9YWRkcil7KytvZmZzZXQ7fWZvcih2YXIgaT0wO2k8Y291bnQmJnN0YWNrW2krb2Zmc2V0XTsrK2kpe0hFQVAzMltidWZmZXIraSo0Pj4yXT1jb252ZXJ0RnJhbWVUb1BDKHN0YWNrW2krb2Zmc2V0XSk7fXJldHVybiBpfWZ1bmN0aW9uIF9lbXNjcmlwdGVuX3Vud2luZF90b19qc19ldmVudF9sb29wKCl7dGhyb3cgInVud2luZCJ9dmFyIEVOVj17fTtmdW5jdGlvbiBnZXRFeGVjdXRhYmxlTmFtZSgpe3JldHVybiB0aGlzUHJvZ3JhbXx8Ii4vdGhpcy5wcm9ncmFtIn1mdW5jdGlvbiBnZXRFbnZTdHJpbmdzKCl7aWYoIWdldEVudlN0cmluZ3Muc3RyaW5ncyl7dmFyIGxhbmc9KHR5cGVvZiBuYXZpZ2F0b3I9PSJvYmplY3QiJiZuYXZpZ2F0b3IubGFuZ3VhZ2VzJiZuYXZpZ2F0b3IubGFuZ3VhZ2VzWzBdfHwiQyIpLnJlcGxhY2UoIi0iLCJfIikrIi5VVEYtOCI7dmFyIGVudj17IlVTRVIiOiJ3ZWJfdXNlciIsIkxPR05BTUUiOiJ3ZWJfdXNlciIsIlBBVEgiOiIvIiwiUFdEIjoiLyIsIkhPTUUiOiIvaG9tZS93ZWJfdXNlciIsIkxBTkciOmxhbmcsIl8iOmdldEV4ZWN1dGFibGVOYW1lKCl9O2Zvcih2YXIgeCBpbiBFTlYpe2lmKEVOVlt4XT09PXVuZGVmaW5lZClkZWxldGUgZW52W3hdO2Vsc2UgZW52W3hdPUVOVlt4XTt9dmFyIHN0cmluZ3M9W107Zm9yKHZhciB4IGluIGVudil7c3RyaW5ncy5wdXNoKHgrIj0iK2Vudlt4XSk7fWdldEVudlN0cmluZ3Muc3RyaW5ncz1zdHJpbmdzO31yZXR1cm4gZ2V0RW52U3RyaW5ncy5zdHJpbmdzfWZ1bmN0aW9uIHdyaXRlQXNjaWlUb01lbW9yeShzdHIsYnVmZmVyLGRvbnRBZGROdWxsKXtmb3IodmFyIGk9MDtpPHN0ci5sZW5ndGg7KytpKXtIRUFQOFtidWZmZXIrKz4+MF09c3RyLmNoYXJDb2RlQXQoaSk7fWlmKCFkb250QWRkTnVsbClIRUFQOFtidWZmZXI+PjBdPTA7fWZ1bmN0aW9uIF9lbnZpcm9uX2dldChfX2Vudmlyb24sZW52aXJvbl9idWYpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDE1LDEsX19lbnZpcm9uLGVudmlyb25fYnVmKTt2YXIgYnVmU2l6ZT0wO2dldEVudlN0cmluZ3MoKS5mb3JFYWNoKGZ1bmN0aW9uKHN0cmluZyxpKXt2YXIgcHRyPWVudmlyb25fYnVmK2J1ZlNpemU7SEVBUFUzMltfX2Vudmlyb24raSo0Pj4yXT1wdHI7d3JpdGVBc2NpaVRvTWVtb3J5KHN0cmluZyxwdHIpO2J1ZlNpemUrPXN0cmluZy5sZW5ndGgrMTt9KTtyZXR1cm4gMH1mdW5jdGlvbiBfZW52aXJvbl9zaXplc19nZXQocGVudmlyb25fY291bnQscGVudmlyb25fYnVmX3NpemUpe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDE2LDEscGVudmlyb25fY291bnQscGVudmlyb25fYnVmX3NpemUpO3ZhciBzdHJpbmdzPWdldEVudlN0cmluZ3MoKTtIRUFQVTMyW3BlbnZpcm9uX2NvdW50Pj4yXT1zdHJpbmdzLmxlbmd0aDt2YXIgYnVmU2l6ZT0wO3N0cmluZ3MuZm9yRWFjaChmdW5jdGlvbihzdHJpbmcpe2J1ZlNpemUrPXN0cmluZy5sZW5ndGgrMTt9KTtIRUFQVTMyW3BlbnZpcm9uX2J1Zl9zaXplPj4yXT1idWZTaXplO3JldHVybiAwfWZ1bmN0aW9uIF9mZF9jbG9zZShmZCl7aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRClyZXR1cm4gX2Vtc2NyaXB0ZW5fcHJveHlfdG9fbWFpbl90aHJlYWRfanMoMTcsMSxmZCk7dHJ5e3ZhciBzdHJlYW09U1lTQ0FMTFMuZ2V0U3RyZWFtRnJvbUZEKGZkKTtGUy5jbG9zZShzdHJlYW0pO3JldHVybiAwfWNhdGNoKGUpe2lmKHR5cGVvZiBGUz09InVuZGVmaW5lZCJ8fCEoZSBpbnN0YW5jZW9mIEZTLkVycm5vRXJyb3IpKXRocm93IGU7cmV0dXJuIGUuZXJybm99fWZ1bmN0aW9uIGRvUmVhZHYoc3RyZWFtLGlvdixpb3ZjbnQsb2Zmc2V0KXt2YXIgcmV0PTA7Zm9yKHZhciBpPTA7aTxpb3ZjbnQ7aSsrKXt2YXIgcHRyPUhFQVBVMzJbaW92Pj4yXTt2YXIgbGVuPUhFQVBVMzJbaW92KzQ+PjJdO2lvdis9ODt2YXIgY3Vycj1GUy5yZWFkKHN0cmVhbSxIRUFQOCxwdHIsbGVuLG9mZnNldCk7aWYoY3VycjwwKXJldHVybiAtMTtyZXQrPWN1cnI7aWYoY3VycjxsZW4pYnJlYWt9cmV0dXJuIHJldH1mdW5jdGlvbiBfZmRfcmVhZChmZCxpb3YsaW92Y250LHBudW0pe2lmKEVOVklST05NRU5UX0lTX1BUSFJFQUQpcmV0dXJuIF9lbXNjcmlwdGVuX3Byb3h5X3RvX21haW5fdGhyZWFkX2pzKDE4LDEsZmQsaW92LGlvdmNudCxwbnVtKTt0cnl7dmFyIHN0cmVhbT1TWVNDQUxMUy5nZXRTdHJlYW1Gcm9tRkQoZmQpO3ZhciBudW09ZG9SZWFkdihzdHJlYW0saW92LGlvdmNudCk7SEVBUFUzMltwbnVtPj4yXT1udW07cmV0dXJuIDB9Y2F0Y2goZSl7aWYodHlwZW9mIEZTPT0idW5kZWZpbmVkInx8IShlIGluc3RhbmNlb2YgRlMuRXJybm9FcnJvcikpdGhyb3cgZTtyZXR1cm4gZS5lcnJub319ZnVuY3Rpb24gY29udmVydEkzMlBhaXJUb0k1M0NoZWNrZWQobG8saGkpe3JldHVybiBoaSsyMDk3MTUyPj4+MDw0MTk0MzA1LSEhbG8/KGxvPj4+MCkraGkqNDI5NDk2NzI5NjpOYU59ZnVuY3Rpb24gX2ZkX3NlZWsoZmQsb2Zmc2V0X2xvdyxvZmZzZXRfaGlnaCx3aGVuY2UsbmV3T2Zmc2V0KXtpZihFTlZJUk9OTUVOVF9JU19QVEhSRUFEKXJldHVybiBfZW1zY3JpcHRlbl9wcm94eV90b19tYWluX3RocmVhZF9qcygxOSwxLGZkLG9mZnNldF9sb3csb2Zmc2V0X2hpZ2gsd2hlbmNlLG5ld09mZnNldCk7dHJ5e3ZhciBvZmZzZXQ9Y29udmVydEkzMlBhaXJUb0k1M0NoZWNrZWQob2Zmc2V0X2xvdyxvZmZzZXRfaGlnaCk7aWYoaXNOYU4ob2Zmc2V0KSlyZXR1cm4gNjE7dmFyIHN0cmVhbT1TWVNDQUxMUy5nZXRTdHJlYW1Gcm9tRkQoZmQpO0ZTLmxsc2VlayhzdHJlYW0sb2Zmc2V0LHdoZW5jZSk7dGVtcEk2ND1bc3RyZWFtLnBvc2l0aW9uPj4+MCwodGVtcERvdWJsZT1zdHJlYW0ucG9zaXRpb24sK01hdGguYWJzKHRlbXBEb3VibGUpPj0xP3RlbXBEb3VibGU+MD8oTWF0aC5taW4oK01hdGguZmxvb3IodGVtcERvdWJsZS80Mjk0OTY3Mjk2KSw0Mjk0OTY3Mjk1KXwwKT4+PjA6fn4rTWF0aC5jZWlsKCh0ZW1wRG91YmxlLSsofn50ZW1wRG91YmxlPj4+MCkpLzQyOTQ5NjcyOTYpPj4+MDowKV0sSEVBUDMyW25ld09mZnNldD4+Ml09dGVtcEk2NFswXSxIRUFQMzJbbmV3T2Zmc2V0KzQ+PjJdPXRlbXBJNjRbMV07aWYoc3RyZWFtLmdldGRlbnRzJiZvZmZzZXQ9PT0wJiZ3aGVuY2U9PT0wKXN0cmVhbS5nZXRkZW50cz1udWxsO3JldHVybiAwfWNhdGNoKGUpe2lmKHR5cGVvZiBGUz09InVuZGVmaW5lZCJ8fCEoZSBpbnN0YW5jZW9mIEZTLkVycm5vRXJyb3IpKXRocm93IGU7cmV0dXJuIGUuZXJybm99fWZ1bmN0aW9uIGRvV3JpdGV2KHN0cmVhbSxpb3YsaW92Y250LG9mZnNldCl7dmFyIHJldD0wO2Zvcih2YXIgaT0wO2k8aW92Y250O2krKyl7dmFyIHB0cj1IRUFQVTMyW2lvdj4+Ml07dmFyIGxlbj1IRUFQVTMyW2lvdis0Pj4yXTtpb3YrPTg7dmFyIGN1cnI9RlMud3JpdGUoc3RyZWFtLEhFQVA4LHB0cixsZW4sb2Zmc2V0KTtpZihjdXJyPDApcmV0dXJuIC0xO3JldCs9Y3Vycjt9cmV0dXJuIHJldH1mdW5jdGlvbiBfZmRfd3JpdGUoZmQsaW92LGlvdmNudCxwbnVtKXtpZihFTlZJUk9OTUVOVF9JU19QVEhSRUFEKXJldHVybiBfZW1zY3JpcHRlbl9wcm94eV90b19tYWluX3RocmVhZF9qcygyMCwxLGZkLGlvdixpb3ZjbnQscG51bSk7dHJ5e3ZhciBzdHJlYW09U1lTQ0FMTFMuZ2V0U3RyZWFtRnJvbUZEKGZkKTt2YXIgbnVtPWRvV3JpdGV2KHN0cmVhbSxpb3YsaW92Y250KTtIRUFQVTMyW3BudW0+PjJdPW51bTtyZXR1cm4gMH1jYXRjaChlKXtpZih0eXBlb2YgRlM9PSJ1bmRlZmluZWQifHwhKGUgaW5zdGFuY2VvZiBGUy5FcnJub0Vycm9yKSl0aHJvdyBlO3JldHVybiBlLmVycm5vfX1mdW5jdGlvbiBfZ2V0ZW50cm9weShidWZmZXIsc2l6ZSl7aWYoIV9nZXRlbnRyb3B5LnJhbmRvbURldmljZSl7X2dldGVudHJvcHkucmFuZG9tRGV2aWNlPWdldFJhbmRvbURldmljZSgpO31mb3IodmFyIGk9MDtpPHNpemU7aSsrKXtIRUFQOFtidWZmZXIraT4+MF09X2dldGVudHJvcHkucmFuZG9tRGV2aWNlKCk7fXJldHVybiAwfWZ1bmN0aW9uIF9fYXJyYXlTdW0oYXJyYXksaW5kZXgpe3ZhciBzdW09MDtmb3IodmFyIGk9MDtpPD1pbmRleDtzdW0rPWFycmF5W2krK10pe31yZXR1cm4gc3VtfXZhciBfX01PTlRIX0RBWVNfTEVBUD1bMzEsMjksMzEsMzAsMzEsMzAsMzEsMzEsMzAsMzEsMzAsMzFdO3ZhciBfX01PTlRIX0RBWVNfUkVHVUxBUj1bMzEsMjgsMzEsMzAsMzEsMzAsMzEsMzEsMzAsMzEsMzAsMzFdO2Z1bmN0aW9uIF9fYWRkRGF5cyhkYXRlLGRheXMpe3ZhciBuZXdEYXRlPW5ldyBEYXRlKGRhdGUuZ2V0VGltZSgpKTt3aGlsZShkYXlzPjApe3ZhciBsZWFwPV9faXNMZWFwWWVhcihuZXdEYXRlLmdldEZ1bGxZZWFyKCkpO3ZhciBjdXJyZW50TW9udGg9bmV3RGF0ZS5nZXRNb250aCgpO3ZhciBkYXlzSW5DdXJyZW50TW9udGg9KGxlYXA/X19NT05USF9EQVlTX0xFQVA6X19NT05USF9EQVlTX1JFR1VMQVIpW2N1cnJlbnRNb250aF07aWYoZGF5cz5kYXlzSW5DdXJyZW50TW9udGgtbmV3RGF0ZS5nZXREYXRlKCkpe2RheXMtPWRheXNJbkN1cnJlbnRNb250aC1uZXdEYXRlLmdldERhdGUoKSsxO25ld0RhdGUuc2V0RGF0ZSgxKTtpZihjdXJyZW50TW9udGg8MTEpe25ld0RhdGUuc2V0TW9udGgoY3VycmVudE1vbnRoKzEpO31lbHNlIHtuZXdEYXRlLnNldE1vbnRoKDApO25ld0RhdGUuc2V0RnVsbFllYXIobmV3RGF0ZS5nZXRGdWxsWWVhcigpKzEpO319ZWxzZSB7bmV3RGF0ZS5zZXREYXRlKG5ld0RhdGUuZ2V0RGF0ZSgpK2RheXMpO3JldHVybiBuZXdEYXRlfX1yZXR1cm4gbmV3RGF0ZX1mdW5jdGlvbiB3cml0ZUFycmF5VG9NZW1vcnkoYXJyYXksYnVmZmVyKXtIRUFQOC5zZXQoYXJyYXksYnVmZmVyKTt9ZnVuY3Rpb24gX3N0cmZ0aW1lKHMsbWF4c2l6ZSxmb3JtYXQsdG0pe3ZhciB0bV96b25lPUhFQVAzMlt0bSs0MD4+Ml07dmFyIGRhdGU9e3RtX3NlYzpIRUFQMzJbdG0+PjJdLHRtX21pbjpIRUFQMzJbdG0rND4+Ml0sdG1faG91cjpIRUFQMzJbdG0rOD4+Ml0sdG1fbWRheTpIRUFQMzJbdG0rMTI+PjJdLHRtX21vbjpIRUFQMzJbdG0rMTY+PjJdLHRtX3llYXI6SEVBUDMyW3RtKzIwPj4yXSx0bV93ZGF5OkhFQVAzMlt0bSsyND4+Ml0sdG1feWRheTpIRUFQMzJbdG0rMjg+PjJdLHRtX2lzZHN0OkhFQVAzMlt0bSszMj4+Ml0sdG1fZ210b2ZmOkhFQVAzMlt0bSszNj4+Ml0sdG1fem9uZTp0bV96b25lP1VURjhUb1N0cmluZyh0bV96b25lKToiIn07dmFyIHBhdHRlcm49VVRGOFRvU3RyaW5nKGZvcm1hdCk7dmFyIEVYUEFOU0lPTl9SVUxFU18xPXsiJWMiOiIlYSAlYiAlZCAlSDolTTolUyAlWSIsIiVEIjoiJW0vJWQvJXkiLCIlRiI6IiVZLSVtLSVkIiwiJWgiOiIlYiIsIiVyIjoiJUk6JU06JVMgJXAiLCIlUiI6IiVIOiVNIiwiJVQiOiIlSDolTTolUyIsIiV4IjoiJW0vJWQvJXkiLCIlWCI6IiVIOiVNOiVTIiwiJUVjIjoiJWMiLCIlRUMiOiIlQyIsIiVFeCI6IiVtLyVkLyV5IiwiJUVYIjoiJUg6JU06JVMiLCIlRXkiOiIleSIsIiVFWSI6IiVZIiwiJU9kIjoiJWQiLCIlT2UiOiIlZSIsIiVPSCI6IiVIIiwiJU9JIjoiJUkiLCIlT20iOiIlbSIsIiVPTSI6IiVNIiwiJU9TIjoiJVMiLCIlT3UiOiIldSIsIiVPVSI6IiVVIiwiJU9WIjoiJVYiLCIlT3ciOiIldyIsIiVPVyI6IiVXIiwiJU95IjoiJXkifTtmb3IodmFyIHJ1bGUgaW4gRVhQQU5TSU9OX1JVTEVTXzEpe3BhdHRlcm49cGF0dGVybi5yZXBsYWNlKG5ldyBSZWdFeHAocnVsZSwiZyIpLEVYUEFOU0lPTl9SVUxFU18xW3J1bGVdKTt9dmFyIFdFRUtEQVlTPVsiU3VuZGF5IiwiTW9uZGF5IiwiVHVlc2RheSIsIldlZG5lc2RheSIsIlRodXJzZGF5IiwiRnJpZGF5IiwiU2F0dXJkYXkiXTt2YXIgTU9OVEhTPVsiSmFudWFyeSIsIkZlYnJ1YXJ5IiwiTWFyY2giLCJBcHJpbCIsIk1heSIsIkp1bmUiLCJKdWx5IiwiQXVndXN0IiwiU2VwdGVtYmVyIiwiT2N0b2JlciIsIk5vdmVtYmVyIiwiRGVjZW1iZXIiXTtmdW5jdGlvbiBsZWFkaW5nU29tZXRoaW5nKHZhbHVlLGRpZ2l0cyxjaGFyYWN0ZXIpe3ZhciBzdHI9dHlwZW9mIHZhbHVlPT0ibnVtYmVyIj92YWx1ZS50b1N0cmluZygpOnZhbHVlfHwiIjt3aGlsZShzdHIubGVuZ3RoPGRpZ2l0cyl7c3RyPWNoYXJhY3RlclswXStzdHI7fXJldHVybiBzdHJ9ZnVuY3Rpb24gbGVhZGluZ051bGxzKHZhbHVlLGRpZ2l0cyl7cmV0dXJuIGxlYWRpbmdTb21ldGhpbmcodmFsdWUsZGlnaXRzLCIwIil9ZnVuY3Rpb24gY29tcGFyZUJ5RGF5KGRhdGUxLGRhdGUyKXtmdW5jdGlvbiBzZ24odmFsdWUpe3JldHVybiB2YWx1ZTwwPy0xOnZhbHVlPjA/MTowfXZhciBjb21wYXJlO2lmKChjb21wYXJlPXNnbihkYXRlMS5nZXRGdWxsWWVhcigpLWRhdGUyLmdldEZ1bGxZZWFyKCkpKT09PTApe2lmKChjb21wYXJlPXNnbihkYXRlMS5nZXRNb250aCgpLWRhdGUyLmdldE1vbnRoKCkpKT09PTApe2NvbXBhcmU9c2duKGRhdGUxLmdldERhdGUoKS1kYXRlMi5nZXREYXRlKCkpO319cmV0dXJuIGNvbXBhcmV9ZnVuY3Rpb24gZ2V0Rmlyc3RXZWVrU3RhcnREYXRlKGphbkZvdXJ0aCl7c3dpdGNoKGphbkZvdXJ0aC5nZXREYXkoKSl7Y2FzZSAwOnJldHVybiBuZXcgRGF0ZShqYW5Gb3VydGguZ2V0RnVsbFllYXIoKS0xLDExLDI5KTtjYXNlIDE6cmV0dXJuIGphbkZvdXJ0aDtjYXNlIDI6cmV0dXJuIG5ldyBEYXRlKGphbkZvdXJ0aC5nZXRGdWxsWWVhcigpLDAsMyk7Y2FzZSAzOnJldHVybiBuZXcgRGF0ZShqYW5Gb3VydGguZ2V0RnVsbFllYXIoKSwwLDIpO2Nhc2UgNDpyZXR1cm4gbmV3IERhdGUoamFuRm91cnRoLmdldEZ1bGxZZWFyKCksMCwxKTtjYXNlIDU6cmV0dXJuIG5ldyBEYXRlKGphbkZvdXJ0aC5nZXRGdWxsWWVhcigpLTEsMTEsMzEpO2Nhc2UgNjpyZXR1cm4gbmV3IERhdGUoamFuRm91cnRoLmdldEZ1bGxZZWFyKCktMSwxMSwzMCl9fWZ1bmN0aW9uIGdldFdlZWtCYXNlZFllYXIoZGF0ZSl7dmFyIHRoaXNEYXRlPV9fYWRkRGF5cyhuZXcgRGF0ZShkYXRlLnRtX3llYXIrMTkwMCwwLDEpLGRhdGUudG1feWRheSk7dmFyIGphbkZvdXJ0aFRoaXNZZWFyPW5ldyBEYXRlKHRoaXNEYXRlLmdldEZ1bGxZZWFyKCksMCw0KTt2YXIgamFuRm91cnRoTmV4dFllYXI9bmV3IERhdGUodGhpc0RhdGUuZ2V0RnVsbFllYXIoKSsxLDAsNCk7dmFyIGZpcnN0V2Vla1N0YXJ0VGhpc1llYXI9Z2V0Rmlyc3RXZWVrU3RhcnREYXRlKGphbkZvdXJ0aFRoaXNZZWFyKTt2YXIgZmlyc3RXZWVrU3RhcnROZXh0WWVhcj1nZXRGaXJzdFdlZWtTdGFydERhdGUoamFuRm91cnRoTmV4dFllYXIpO2lmKGNvbXBhcmVCeURheShmaXJzdFdlZWtTdGFydFRoaXNZZWFyLHRoaXNEYXRlKTw9MCl7aWYoY29tcGFyZUJ5RGF5KGZpcnN0V2Vla1N0YXJ0TmV4dFllYXIsdGhpc0RhdGUpPD0wKXtyZXR1cm4gdGhpc0RhdGUuZ2V0RnVsbFllYXIoKSsxfXJldHVybiB0aGlzRGF0ZS5nZXRGdWxsWWVhcigpfXJldHVybiB0aGlzRGF0ZS5nZXRGdWxsWWVhcigpLTF9dmFyIEVYUEFOU0lPTl9SVUxFU18yPXsiJWEiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBXRUVLREFZU1tkYXRlLnRtX3dkYXldLnN1YnN0cmluZygwLDMpfSwiJUEiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBXRUVLREFZU1tkYXRlLnRtX3dkYXldfSwiJWIiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBNT05USFNbZGF0ZS50bV9tb25dLnN1YnN0cmluZygwLDMpfSwiJUIiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBNT05USFNbZGF0ZS50bV9tb25dfSwiJUMiOmZ1bmN0aW9uKGRhdGUpe3ZhciB5ZWFyPWRhdGUudG1feWVhcisxOTAwO3JldHVybiBsZWFkaW5nTnVsbHMoeWVhci8xMDB8MCwyKX0sIiVkIjpmdW5jdGlvbihkYXRlKXtyZXR1cm4gbGVhZGluZ051bGxzKGRhdGUudG1fbWRheSwyKX0sIiVlIjpmdW5jdGlvbihkYXRlKXtyZXR1cm4gbGVhZGluZ1NvbWV0aGluZyhkYXRlLnRtX21kYXksMiwiICIpfSwiJWciOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBnZXRXZWVrQmFzZWRZZWFyKGRhdGUpLnRvU3RyaW5nKCkuc3Vic3RyaW5nKDIpfSwiJUciOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBnZXRXZWVrQmFzZWRZZWFyKGRhdGUpfSwiJUgiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBsZWFkaW5nTnVsbHMoZGF0ZS50bV9ob3VyLDIpfSwiJUkiOmZ1bmN0aW9uKGRhdGUpe3ZhciB0d2VsdmVIb3VyPWRhdGUudG1faG91cjtpZih0d2VsdmVIb3VyPT0wKXR3ZWx2ZUhvdXI9MTI7ZWxzZSBpZih0d2VsdmVIb3VyPjEyKXR3ZWx2ZUhvdXItPTEyO3JldHVybiBsZWFkaW5nTnVsbHModHdlbHZlSG91ciwyKX0sIiVqIjpmdW5jdGlvbihkYXRlKXtyZXR1cm4gbGVhZGluZ051bGxzKGRhdGUudG1fbWRheStfX2FycmF5U3VtKF9faXNMZWFwWWVhcihkYXRlLnRtX3llYXIrMTkwMCk/X19NT05USF9EQVlTX0xFQVA6X19NT05USF9EQVlTX1JFR1VMQVIsZGF0ZS50bV9tb24tMSksMyl9LCIlbSI6ZnVuY3Rpb24oZGF0ZSl7cmV0dXJuIGxlYWRpbmdOdWxscyhkYXRlLnRtX21vbisxLDIpfSwiJU0iOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBsZWFkaW5nTnVsbHMoZGF0ZS50bV9taW4sMil9LCIlbiI6ZnVuY3Rpb24oKXtyZXR1cm4gIlxuIn0sIiVwIjpmdW5jdGlvbihkYXRlKXtpZihkYXRlLnRtX2hvdXI+PTAmJmRhdGUudG1faG91cjwxMil7cmV0dXJuICJBTSJ9cmV0dXJuICJQTSJ9LCIlUyI6ZnVuY3Rpb24oZGF0ZSl7cmV0dXJuIGxlYWRpbmdOdWxscyhkYXRlLnRtX3NlYywyKX0sIiV0IjpmdW5jdGlvbigpe3JldHVybiAiXHQifSwiJXUiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBkYXRlLnRtX3dkYXl8fDd9LCIlVSI6ZnVuY3Rpb24oZGF0ZSl7dmFyIGRheXM9ZGF0ZS50bV95ZGF5KzctZGF0ZS50bV93ZGF5O3JldHVybiBsZWFkaW5nTnVsbHMoTWF0aC5mbG9vcihkYXlzLzcpLDIpfSwiJVYiOmZ1bmN0aW9uKGRhdGUpe3ZhciB2YWw9TWF0aC5mbG9vcigoZGF0ZS50bV95ZGF5KzctKGRhdGUudG1fd2RheSs2KSU3KS83KTtpZigoZGF0ZS50bV93ZGF5KzM3MS1kYXRlLnRtX3lkYXktMiklNzw9Mil7dmFsKys7fWlmKCF2YWwpe3ZhbD01Mjt2YXIgZGVjMzE9KGRhdGUudG1fd2RheSs3LWRhdGUudG1feWRheS0xKSU3O2lmKGRlYzMxPT00fHxkZWMzMT09NSYmX19pc0xlYXBZZWFyKGRhdGUudG1feWVhciU0MDAtMSkpe3ZhbCsrO319ZWxzZSBpZih2YWw9PTUzKXt2YXIgamFuMT0oZGF0ZS50bV93ZGF5KzM3MS1kYXRlLnRtX3lkYXkpJTc7aWYoamFuMSE9NCYmKGphbjEhPTN8fCFfX2lzTGVhcFllYXIoZGF0ZS50bV95ZWFyKSkpdmFsPTE7fXJldHVybiBsZWFkaW5nTnVsbHModmFsLDIpfSwiJXciOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBkYXRlLnRtX3dkYXl9LCIlVyI6ZnVuY3Rpb24oZGF0ZSl7dmFyIGRheXM9ZGF0ZS50bV95ZGF5KzctKGRhdGUudG1fd2RheSs2KSU3O3JldHVybiBsZWFkaW5nTnVsbHMoTWF0aC5mbG9vcihkYXlzLzcpLDIpfSwiJXkiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiAoZGF0ZS50bV95ZWFyKzE5MDApLnRvU3RyaW5nKCkuc3Vic3RyaW5nKDIpfSwiJVkiOmZ1bmN0aW9uKGRhdGUpe3JldHVybiBkYXRlLnRtX3llYXIrMTkwMH0sIiV6IjpmdW5jdGlvbihkYXRlKXt2YXIgb2ZmPWRhdGUudG1fZ210b2ZmO3ZhciBhaGVhZD1vZmY+PTA7b2ZmPU1hdGguYWJzKG9mZikvNjA7b2ZmPW9mZi82MCoxMDArb2ZmJTYwO3JldHVybiAoYWhlYWQ/IisiOiItIikrU3RyaW5nKCIwMDAwIitvZmYpLnNsaWNlKC00KX0sIiVaIjpmdW5jdGlvbihkYXRlKXtyZXR1cm4gZGF0ZS50bV96b25lfSwiJSUiOmZ1bmN0aW9uKCl7cmV0dXJuICIlIn19O3BhdHRlcm49cGF0dGVybi5yZXBsYWNlKC8lJS9nLCJcMFwwIik7Zm9yKHZhciBydWxlIGluIEVYUEFOU0lPTl9SVUxFU18yKXtpZihwYXR0ZXJuLmluY2x1ZGVzKHJ1bGUpKXtwYXR0ZXJuPXBhdHRlcm4ucmVwbGFjZShuZXcgUmVnRXhwKHJ1bGUsImciKSxFWFBBTlNJT05fUlVMRVNfMltydWxlXShkYXRlKSk7fX1wYXR0ZXJuPXBhdHRlcm4ucmVwbGFjZSgvXDBcMC9nLCIlIik7dmFyIGJ5dGVzPWludEFycmF5RnJvbVN0cmluZyhwYXR0ZXJuLGZhbHNlKTtpZihieXRlcy5sZW5ndGg+bWF4c2l6ZSl7cmV0dXJuIDB9d3JpdGVBcnJheVRvTWVtb3J5KGJ5dGVzLHMpO3JldHVybiBieXRlcy5sZW5ndGgtMX1mdW5jdGlvbiBfc3RyZnRpbWVfbChzLG1heHNpemUsZm9ybWF0LHRtLGxvYyl7cmV0dXJuIF9zdHJmdGltZShzLG1heHNpemUsZm9ybWF0LHRtKX1QVGhyZWFkLmluaXQoKTt2YXIgRlNOb2RlPWZ1bmN0aW9uKHBhcmVudCxuYW1lLG1vZGUscmRldil7aWYoIXBhcmVudCl7cGFyZW50PXRoaXM7fXRoaXMucGFyZW50PXBhcmVudDt0aGlzLm1vdW50PXBhcmVudC5tb3VudDt0aGlzLm1vdW50ZWQ9bnVsbDt0aGlzLmlkPUZTLm5leHRJbm9kZSsrO3RoaXMubmFtZT1uYW1lO3RoaXMubW9kZT1tb2RlO3RoaXMubm9kZV9vcHM9e307dGhpcy5zdHJlYW1fb3BzPXt9O3RoaXMucmRldj1yZGV2O307dmFyIHJlYWRNb2RlPTI5Mnw3Mzt2YXIgd3JpdGVNb2RlPTE0NjtPYmplY3QuZGVmaW5lUHJvcGVydGllcyhGU05vZGUucHJvdG90eXBlLHtyZWFkOntnZXQ6ZnVuY3Rpb24oKXtyZXR1cm4gKHRoaXMubW9kZSZyZWFkTW9kZSk9PT1yZWFkTW9kZX0sc2V0OmZ1bmN0aW9uKHZhbCl7dmFsP3RoaXMubW9kZXw9cmVhZE1vZGU6dGhpcy5tb2RlJj1+cmVhZE1vZGU7fX0sd3JpdGU6e2dldDpmdW5jdGlvbigpe3JldHVybiAodGhpcy5tb2RlJndyaXRlTW9kZSk9PT13cml0ZU1vZGV9LHNldDpmdW5jdGlvbih2YWwpe3ZhbD90aGlzLm1vZGV8PXdyaXRlTW9kZTp0aGlzLm1vZGUmPX53cml0ZU1vZGU7fX0saXNGb2xkZXI6e2dldDpmdW5jdGlvbigpe3JldHVybiBGUy5pc0Rpcih0aGlzLm1vZGUpfX0saXNEZXZpY2U6e2dldDpmdW5jdGlvbigpe3JldHVybiBGUy5pc0NocmRldih0aGlzLm1vZGUpfX19KTtGUy5GU05vZGU9RlNOb2RlO0ZTLnN0YXRpY0luaXQoKTtNb2R1bGVbIkZTX2NyZWF0ZVBhdGgiXT1GUy5jcmVhdGVQYXRoO01vZHVsZVsiRlNfY3JlYXRlRGF0YUZpbGUiXT1GUy5jcmVhdGVEYXRhRmlsZTtNb2R1bGVbIkZTX2NyZWF0ZVByZWxvYWRlZEZpbGUiXT1GUy5jcmVhdGVQcmVsb2FkZWRGaWxlO01vZHVsZVsiRlNfdW5saW5rIl09RlMudW5saW5rO01vZHVsZVsiRlNfY3JlYXRlTGF6eUZpbGUiXT1GUy5jcmVhdGVMYXp5RmlsZTtNb2R1bGVbIkZTX2NyZWF0ZURldmljZSJdPUZTLmNyZWF0ZURldmljZTtlbWJpbmRfaW5pdF9jaGFyQ29kZXMoKTtCaW5kaW5nRXJyb3I9TW9kdWxlWyJCaW5kaW5nRXJyb3IiXT1leHRlbmRFcnJvcihFcnJvciwiQmluZGluZ0Vycm9yIik7SW50ZXJuYWxFcnJvcj1Nb2R1bGVbIkludGVybmFsRXJyb3IiXT1leHRlbmRFcnJvcihFcnJvciwiSW50ZXJuYWxFcnJvciIpO2luaXRfQ2xhc3NIYW5kbGUoKTtpbml0X2VtYmluZCgpO2luaXRfUmVnaXN0ZXJlZFBvaW50ZXIoKTtVbmJvdW5kVHlwZUVycm9yPU1vZHVsZVsiVW5ib3VuZFR5cGVFcnJvciJdPWV4dGVuZEVycm9yKEVycm9yLCJVbmJvdW5kVHlwZUVycm9yIik7aW5pdF9lbXZhbCgpO3ZhciBwcm94aWVkRnVuY3Rpb25UYWJsZT1bbnVsbCxfcHJvY19leGl0LGV4aXRPbk1haW5UaHJlYWQscHRocmVhZENyZWF0ZVByb3hpZWQsX19fc3lzY2FsbF9mY250bDY0LF9fX3N5c2NhbGxfZnN0YXQ2NCxfX19zeXNjYWxsX2dldGRlbnRzNjQsX19fc3lzY2FsbF9pb2N0bCxfX19zeXNjYWxsX2xzdGF0NjQsX19fc3lzY2FsbF9uZXdmc3RhdGF0LF9fX3N5c2NhbGxfb3BlbmF0LF9fX3N5c2NhbGxfc3RhdDY0LF9fX3N5c2NhbGxfdW5saW5rYXQsX19tbWFwX2pzLF9fbXVubWFwX2pzLF9lbnZpcm9uX2dldCxfZW52aXJvbl9zaXplc19nZXQsX2ZkX2Nsb3NlLF9mZF9yZWFkLF9mZF9zZWVrLF9mZF93cml0ZV07dmFyIGFzbUxpYnJhcnlBcmc9eyJIYXZlT2Zmc2V0Q29udmVydGVyIjpIYXZlT2Zmc2V0Q29udmVydGVyLCJfVW53aW5kX0JhY2t0cmFjZSI6X19VbndpbmRfQmFja3RyYWNlLCJfVW53aW5kX0dldElQIjpfX1Vud2luZF9HZXRJUCwiX19lbXNjcmlwdGVuX2luaXRfbWFpbl90aHJlYWRfanMiOl9fX2Vtc2NyaXB0ZW5faW5pdF9tYWluX3RocmVhZF9qcywiX19lbXNjcmlwdGVuX3RocmVhZF9jbGVhbnVwIjpfX19lbXNjcmlwdGVuX3RocmVhZF9jbGVhbnVwLCJfX3B0aHJlYWRfY3JlYXRlX2pzIjpfX19wdGhyZWFkX2NyZWF0ZV9qcywiX19zeXNjYWxsX2ZjbnRsNjQiOl9fX3N5c2NhbGxfZmNudGw2NCwiX19zeXNjYWxsX2ZzdGF0NjQiOl9fX3N5c2NhbGxfZnN0YXQ2NCwiX19zeXNjYWxsX2dldGRlbnRzNjQiOl9fX3N5c2NhbGxfZ2V0ZGVudHM2NCwiX19zeXNjYWxsX2lvY3RsIjpfX19zeXNjYWxsX2lvY3RsLCJfX3N5c2NhbGxfbHN0YXQ2NCI6X19fc3lzY2FsbF9sc3RhdDY0LCJfX3N5c2NhbGxfbmV3ZnN0YXRhdCI6X19fc3lzY2FsbF9uZXdmc3RhdGF0LCJfX3N5c2NhbGxfb3BlbmF0IjpfX19zeXNjYWxsX29wZW5hdCwiX19zeXNjYWxsX3N0YXQ2NCI6X19fc3lzY2FsbF9zdGF0NjQsIl9fc3lzY2FsbF91bmxpbmthdCI6X19fc3lzY2FsbF91bmxpbmthdCwiX2RsaW5pdCI6X19kbGluaXQsIl9kbG9wZW5fanMiOl9fZGxvcGVuX2pzLCJfZGxzeW1fanMiOl9fZGxzeW1fanMsIl9lbWJpbmRfcmVnaXN0ZXJfYmlnaW50IjpfX2VtYmluZF9yZWdpc3Rlcl9iaWdpbnQsIl9lbWJpbmRfcmVnaXN0ZXJfYm9vbCI6X19lbWJpbmRfcmVnaXN0ZXJfYm9vbCwiX2VtYmluZF9yZWdpc3Rlcl9jbGFzcyI6X19lbWJpbmRfcmVnaXN0ZXJfY2xhc3MsIl9lbWJpbmRfcmVnaXN0ZXJfY2xhc3NfY2xhc3NfZnVuY3Rpb24iOl9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2NsYXNzX2Z1bmN0aW9uLCJfZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2NvbnN0cnVjdG9yIjpfX2VtYmluZF9yZWdpc3Rlcl9jbGFzc19jb25zdHJ1Y3RvciwiX2VtYmluZF9yZWdpc3Rlcl9jbGFzc19mdW5jdGlvbiI6X19lbWJpbmRfcmVnaXN0ZXJfY2xhc3NfZnVuY3Rpb24sIl9lbWJpbmRfcmVnaXN0ZXJfZW12YWwiOl9fZW1iaW5kX3JlZ2lzdGVyX2VtdmFsLCJfZW1iaW5kX3JlZ2lzdGVyX2Zsb2F0IjpfX2VtYmluZF9yZWdpc3Rlcl9mbG9hdCwiX2VtYmluZF9yZWdpc3Rlcl9mdW5jdGlvbiI6X19lbWJpbmRfcmVnaXN0ZXJfZnVuY3Rpb24sIl9lbWJpbmRfcmVnaXN0ZXJfaW50ZWdlciI6X19lbWJpbmRfcmVnaXN0ZXJfaW50ZWdlciwiX2VtYmluZF9yZWdpc3Rlcl9tZW1vcnlfdmlldyI6X19lbWJpbmRfcmVnaXN0ZXJfbWVtb3J5X3ZpZXcsIl9lbWJpbmRfcmVnaXN0ZXJfc3RkX3N0cmluZyI6X19lbWJpbmRfcmVnaXN0ZXJfc3RkX3N0cmluZywiX2VtYmluZF9yZWdpc3Rlcl9zdGRfd3N0cmluZyI6X19lbWJpbmRfcmVnaXN0ZXJfc3RkX3dzdHJpbmcsIl9lbWJpbmRfcmVnaXN0ZXJfdm9pZCI6X19lbWJpbmRfcmVnaXN0ZXJfdm9pZCwiX2Vtc2NyaXB0ZW5fZGVmYXVsdF9wdGhyZWFkX3N0YWNrX3NpemUiOl9fZW1zY3JpcHRlbl9kZWZhdWx0X3B0aHJlYWRfc3RhY2tfc2l6ZSwiX2Vtc2NyaXB0ZW5fZ2V0X25vd19pc19tb25vdG9uaWMiOl9fZW1zY3JpcHRlbl9nZXRfbm93X2lzX21vbm90b25pYywiX2Vtc2NyaXB0ZW5fbm90aWZ5X3Rhc2tfcXVldWUiOl9fZW1zY3JpcHRlbl9ub3RpZnlfdGFza19xdWV1ZSwiX2Vtc2NyaXB0ZW5fc2V0X29mZnNjcmVlbmNhbnZhc19zaXplIjpfX2Vtc2NyaXB0ZW5fc2V0X29mZnNjcmVlbmNhbnZhc19zaXplLCJfZW12YWxfY2FsbF92b2lkX21ldGhvZCI6X19lbXZhbF9jYWxsX3ZvaWRfbWV0aG9kLCJfZW12YWxfZGVjcmVmIjpfX2VtdmFsX2RlY3JlZiwiX2VtdmFsX2dldF9tZXRob2RfY2FsbGVyIjpfX2VtdmFsX2dldF9tZXRob2RfY2FsbGVyLCJfZW12YWxfaW5jcmVmIjpfX2VtdmFsX2luY3JlZiwiX2VtdmFsX3Rha2VfdmFsdWUiOl9fZW12YWxfdGFrZV92YWx1ZSwiX2dtdGltZV9qcyI6X19nbXRpbWVfanMsIl9sb2NhbHRpbWVfanMiOl9fbG9jYWx0aW1lX2pzLCJfbWt0aW1lX2pzIjpfX21rdGltZV9qcywiX21tYXBfanMiOl9fbW1hcF9qcywiX211bm1hcF9qcyI6X19tdW5tYXBfanMsIl90enNldF9qcyI6X190enNldF9qcywiYWJvcnQiOl9hYm9ydCwiZW1zY3JpcHRlbl9hc21fY29uc3RfaW50IjpfZW1zY3JpcHRlbl9hc21fY29uc3RfaW50LCJlbXNjcmlwdGVuX2NoZWNrX2Jsb2NraW5nX2FsbG93ZWQiOl9lbXNjcmlwdGVuX2NoZWNrX2Jsb2NraW5nX2FsbG93ZWQsImVtc2NyaXB0ZW5fZGF0ZV9ub3ciOl9lbXNjcmlwdGVuX2RhdGVfbm93LCJlbXNjcmlwdGVuX2dldF9oZWFwX21heCI6X2Vtc2NyaXB0ZW5fZ2V0X2hlYXBfbWF4LCJlbXNjcmlwdGVuX2dldF9ub3ciOl9lbXNjcmlwdGVuX2dldF9ub3csImVtc2NyaXB0ZW5fbWVtY3B5X2JpZyI6X2Vtc2NyaXB0ZW5fbWVtY3B5X2JpZywiZW1zY3JpcHRlbl9udW1fbG9naWNhbF9jb3JlcyI6X2Vtc2NyaXB0ZW5fbnVtX2xvZ2ljYWxfY29yZXMsImVtc2NyaXB0ZW5fcmVjZWl2ZV9vbl9tYWluX3RocmVhZF9qcyI6X2Vtc2NyaXB0ZW5fcmVjZWl2ZV9vbl9tYWluX3RocmVhZF9qcywiZW1zY3JpcHRlbl9yZXNpemVfaGVhcCI6X2Vtc2NyaXB0ZW5fcmVzaXplX2hlYXAsImVtc2NyaXB0ZW5fc3RhY2tfc25hcHNob3QiOl9lbXNjcmlwdGVuX3N0YWNrX3NuYXBzaG90LCJlbXNjcmlwdGVuX3N0YWNrX3Vud2luZF9idWZmZXIiOl9lbXNjcmlwdGVuX3N0YWNrX3Vud2luZF9idWZmZXIsImVtc2NyaXB0ZW5fdW53aW5kX3RvX2pzX2V2ZW50X2xvb3AiOl9lbXNjcmlwdGVuX3Vud2luZF90b19qc19ldmVudF9sb29wLCJlbnZpcm9uX2dldCI6X2Vudmlyb25fZ2V0LCJlbnZpcm9uX3NpemVzX2dldCI6X2Vudmlyb25fc2l6ZXNfZ2V0LCJleGl0IjpfZXhpdCwiZmRfY2xvc2UiOl9mZF9jbG9zZSwiZmRfcmVhZCI6X2ZkX3JlYWQsImZkX3NlZWsiOl9mZF9zZWVrLCJmZF93cml0ZSI6X2ZkX3dyaXRlLCJnZXRlbnRyb3B5IjpfZ2V0ZW50cm9weSwibWVtb3J5Ijp3YXNtTWVtb3J5fHxNb2R1bGVbIndhc21NZW1vcnkiXSwic3RyZnRpbWVfbCI6X3N0cmZ0aW1lX2x9O2NyZWF0ZVdhc20oKTtNb2R1bGVbIl9fX3dhc21fY2FsbF9jdG9ycyJdPWZ1bmN0aW9uKCl7cmV0dXJuIChNb2R1bGVbIl9fX3dhc21fY2FsbF9jdG9ycyJdPU1vZHVsZVsiYXNtIl1bIl9fd2FzbV9jYWxsX2N0b3JzIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07dmFyIF9fX2Vycm5vX2xvY2F0aW9uPU1vZHVsZVsiX19fZXJybm9fbG9jYXRpb24iXT1mdW5jdGlvbigpe3JldHVybiAoX19fZXJybm9fbG9jYXRpb249TW9kdWxlWyJfX19lcnJub19sb2NhdGlvbiJdPU1vZHVsZVsiYXNtIl1bIl9fZXJybm9fbG9jYXRpb24iXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTt2YXIgX21hbGxvYz1Nb2R1bGVbIl9tYWxsb2MiXT1mdW5jdGlvbigpe3JldHVybiAoX21hbGxvYz1Nb2R1bGVbIl9tYWxsb2MiXT1Nb2R1bGVbImFzbSJdWyJtYWxsb2MiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTt2YXIgX2ZyZWU9TW9kdWxlWyJfZnJlZSJdPWZ1bmN0aW9uKCl7cmV0dXJuIChfZnJlZT1Nb2R1bGVbIl9mcmVlIl09TW9kdWxlWyJhc20iXVsiZnJlZSJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O3ZhciBfcHRocmVhZF9zZWxmPU1vZHVsZVsiX3B0aHJlYWRfc2VsZiJdPWZ1bmN0aW9uKCl7cmV0dXJuIChfcHRocmVhZF9zZWxmPU1vZHVsZVsiX3B0aHJlYWRfc2VsZiJdPU1vZHVsZVsiYXNtIl1bInB0aHJlYWRfc2VsZiJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiX19lbXNjcmlwdGVuX3Rsc19pbml0Il09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiX19lbXNjcmlwdGVuX3Rsc19pbml0Il09TW9kdWxlWyJhc20iXVsiX2Vtc2NyaXB0ZW5fdGxzX2luaXQiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTt2YXIgX2Vtc2NyaXB0ZW5fYnVpbHRpbl9tZW1hbGlnbj1Nb2R1bGVbIl9lbXNjcmlwdGVuX2J1aWx0aW5fbWVtYWxpZ24iXT1mdW5jdGlvbigpe3JldHVybiAoX2Vtc2NyaXB0ZW5fYnVpbHRpbl9tZW1hbGlnbj1Nb2R1bGVbIl9lbXNjcmlwdGVuX2J1aWx0aW5fbWVtYWxpZ24iXT1Nb2R1bGVbImFzbSJdWyJlbXNjcmlwdGVuX2J1aWx0aW5fbWVtYWxpZ24iXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTt2YXIgX19fZ2V0VHlwZU5hbWU9TW9kdWxlWyJfX19nZXRUeXBlTmFtZSJdPWZ1bmN0aW9uKCl7cmV0dXJuIChfX19nZXRUeXBlTmFtZT1Nb2R1bGVbIl9fX2dldFR5cGVOYW1lIl09TW9kdWxlWyJhc20iXVsiX19nZXRUeXBlTmFtZSJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiX19lbWJpbmRfaW5pdGlhbGl6ZV9iaW5kaW5ncyJdPWZ1bmN0aW9uKCl7cmV0dXJuIChNb2R1bGVbIl9fZW1iaW5kX2luaXRpYWxpemVfYmluZGluZ3MiXT1Nb2R1bGVbImFzbSJdWyJfZW1iaW5kX2luaXRpYWxpemVfYmluZGluZ3MiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbIl9fX2RsX3NldGVyciJdPWZ1bmN0aW9uKCl7cmV0dXJuIChNb2R1bGVbIl9fX2RsX3NldGVyciJdPU1vZHVsZVsiYXNtIl1bIl9fZGxfc2V0ZXJyIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07dmFyIF9fZW1zY3JpcHRlbl90aHJlYWRfaW5pdD1Nb2R1bGVbIl9fZW1zY3JpcHRlbl90aHJlYWRfaW5pdCJdPWZ1bmN0aW9uKCl7cmV0dXJuIChfX2Vtc2NyaXB0ZW5fdGhyZWFkX2luaXQ9TW9kdWxlWyJfX2Vtc2NyaXB0ZW5fdGhyZWFkX2luaXQiXT1Nb2R1bGVbImFzbSJdWyJfZW1zY3JpcHRlbl90aHJlYWRfaW5pdCJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiX19lbXNjcmlwdGVuX3RocmVhZF9jcmFzaGVkIl09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiX19lbXNjcmlwdGVuX3RocmVhZF9jcmFzaGVkIl09TW9kdWxlWyJhc20iXVsiX2Vtc2NyaXB0ZW5fdGhyZWFkX2NyYXNoZWQiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbIl9lbXNjcmlwdGVuX21haW5fdGhyZWFkX3Byb2Nlc3NfcXVldWVkX2NhbGxzIl09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiX2Vtc2NyaXB0ZW5fbWFpbl90aHJlYWRfcHJvY2Vzc19xdWV1ZWRfY2FsbHMiXT1Nb2R1bGVbImFzbSJdWyJlbXNjcmlwdGVuX21haW5fdGhyZWFkX3Byb2Nlc3NfcXVldWVkX2NhbGxzIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJfZW1zY3JpcHRlbl9tYWluX2Jyb3dzZXJfdGhyZWFkX2lkIl09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiX2Vtc2NyaXB0ZW5fbWFpbl9icm93c2VyX3RocmVhZF9pZCJdPU1vZHVsZVsiYXNtIl1bImVtc2NyaXB0ZW5fbWFpbl9icm93c2VyX3RocmVhZF9pZCJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O3ZhciBfZW1zY3JpcHRlbl9ydW5faW5fbWFpbl9ydW50aW1lX3RocmVhZF9qcz1Nb2R1bGVbIl9lbXNjcmlwdGVuX3J1bl9pbl9tYWluX3J1bnRpbWVfdGhyZWFkX2pzIl09ZnVuY3Rpb24oKXtyZXR1cm4gKF9lbXNjcmlwdGVuX3J1bl9pbl9tYWluX3J1bnRpbWVfdGhyZWFkX2pzPU1vZHVsZVsiX2Vtc2NyaXB0ZW5fcnVuX2luX21haW5fcnVudGltZV90aHJlYWRfanMiXT1Nb2R1bGVbImFzbSJdWyJlbXNjcmlwdGVuX3J1bl9pbl9tYWluX3J1bnRpbWVfdGhyZWFkX2pzIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJfZW1zY3JpcHRlbl9kaXNwYXRjaF90b190aHJlYWRfIl09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiX2Vtc2NyaXB0ZW5fZGlzcGF0Y2hfdG9fdGhyZWFkXyJdPU1vZHVsZVsiYXNtIl1bImVtc2NyaXB0ZW5fZGlzcGF0Y2hfdG9fdGhyZWFkXyJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O3ZhciBfX2Vtc2NyaXB0ZW5fcHJveHlfZXhlY3V0ZV90YXNrX3F1ZXVlPU1vZHVsZVsiX19lbXNjcmlwdGVuX3Byb3h5X2V4ZWN1dGVfdGFza19xdWV1ZSJdPWZ1bmN0aW9uKCl7cmV0dXJuIChfX2Vtc2NyaXB0ZW5fcHJveHlfZXhlY3V0ZV90YXNrX3F1ZXVlPU1vZHVsZVsiX19lbXNjcmlwdGVuX3Byb3h5X2V4ZWN1dGVfdGFza19xdWV1ZSJdPU1vZHVsZVsiYXNtIl1bIl9lbXNjcmlwdGVuX3Byb3h5X2V4ZWN1dGVfdGFza19xdWV1ZSJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O3ZhciBfX2Vtc2NyaXB0ZW5fdGhyZWFkX2ZyZWVfZGF0YT1Nb2R1bGVbIl9fZW1zY3JpcHRlbl90aHJlYWRfZnJlZV9kYXRhIl09ZnVuY3Rpb24oKXtyZXR1cm4gKF9fZW1zY3JpcHRlbl90aHJlYWRfZnJlZV9kYXRhPU1vZHVsZVsiX19lbXNjcmlwdGVuX3RocmVhZF9mcmVlX2RhdGEiXT1Nb2R1bGVbImFzbSJdWyJfZW1zY3JpcHRlbl90aHJlYWRfZnJlZV9kYXRhIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07dmFyIF9fZW1zY3JpcHRlbl90aHJlYWRfZXhpdD1Nb2R1bGVbIl9fZW1zY3JpcHRlbl90aHJlYWRfZXhpdCJdPWZ1bmN0aW9uKCl7cmV0dXJuIChfX2Vtc2NyaXB0ZW5fdGhyZWFkX2V4aXQ9TW9kdWxlWyJfX2Vtc2NyaXB0ZW5fdGhyZWFkX2V4aXQiXT1Nb2R1bGVbImFzbSJdWyJfZW1zY3JpcHRlbl90aHJlYWRfZXhpdCJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O3ZhciBfZW1zY3JpcHRlbl9zdGFja19zZXRfbGltaXRzPU1vZHVsZVsiX2Vtc2NyaXB0ZW5fc3RhY2tfc2V0X2xpbWl0cyJdPWZ1bmN0aW9uKCl7cmV0dXJuIChfZW1zY3JpcHRlbl9zdGFja19zZXRfbGltaXRzPU1vZHVsZVsiX2Vtc2NyaXB0ZW5fc3RhY2tfc2V0X2xpbWl0cyJdPU1vZHVsZVsiYXNtIl1bImVtc2NyaXB0ZW5fc3RhY2tfc2V0X2xpbWl0cyJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O3ZhciBzdGFja1NhdmU9TW9kdWxlWyJzdGFja1NhdmUiXT1mdW5jdGlvbigpe3JldHVybiAoc3RhY2tTYXZlPU1vZHVsZVsic3RhY2tTYXZlIl09TW9kdWxlWyJhc20iXVsic3RhY2tTYXZlIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07dmFyIHN0YWNrUmVzdG9yZT1Nb2R1bGVbInN0YWNrUmVzdG9yZSJdPWZ1bmN0aW9uKCl7cmV0dXJuIChzdGFja1Jlc3RvcmU9TW9kdWxlWyJzdGFja1Jlc3RvcmUiXT1Nb2R1bGVbImFzbSJdWyJzdGFja1Jlc3RvcmUiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTt2YXIgc3RhY2tBbGxvYz1Nb2R1bGVbInN0YWNrQWxsb2MiXT1mdW5jdGlvbigpe3JldHVybiAoc3RhY2tBbGxvYz1Nb2R1bGVbInN0YWNrQWxsb2MiXT1Nb2R1bGVbImFzbSJdWyJzdGFja0FsbG9jIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJkeW5DYWxsX2pqaiJdPWZ1bmN0aW9uKCl7cmV0dXJuIChNb2R1bGVbImR5bkNhbGxfampqIl09TW9kdWxlWyJhc20iXVsiZHluQ2FsbF9qamoiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbImR5bkNhbGxfamlpaSJdPWZ1bmN0aW9uKCl7cmV0dXJuIChNb2R1bGVbImR5bkNhbGxfamlpaSJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfamlpaSJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiZHluQ2FsbF9paWlpamoiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX2lpaWlqaiJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfaWlpaWpqIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJkeW5DYWxsX3ZpaWpqIl09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiZHluQ2FsbF92aWlqaiJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfdmlpamoiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbImR5bkNhbGxfdmlpaWpqamoiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX3ZpaWlqampqIl09TW9kdWxlWyJhc20iXVsiZHluQ2FsbF92aWlpampqaiJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiZHluQ2FsbF9qaWkiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX2ppaSJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfamlpIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJkeW5DYWxsX3ZpamkiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX3ZpamkiXT1Nb2R1bGVbImFzbSJdWyJkeW5DYWxsX3ZpamkiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbImR5bkNhbGxfamkiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX2ppIl09TW9kdWxlWyJhc20iXVsiZHluQ2FsbF9qaSJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiZHluQ2FsbF92aiJdPWZ1bmN0aW9uKCl7cmV0dXJuIChNb2R1bGVbImR5bkNhbGxfdmoiXT1Nb2R1bGVbImFzbSJdWyJkeW5DYWxsX3ZqIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJkeW5DYWxsX3ZpaWoiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX3ZpaWoiXT1Nb2R1bGVbImFzbSJdWyJkeW5DYWxsX3ZpaWoiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbImR5bkNhbGxfdmlqIl09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiZHluQ2FsbF92aWoiXT1Nb2R1bGVbImFzbSJdWyJkeW5DYWxsX3ZpaiJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiZHluQ2FsbF92aWlqaWkiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX3ZpaWppaSJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfdmlpamlpIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJkeW5DYWxsX2lpamppaWlpIl09ZnVuY3Rpb24oKXtyZXR1cm4gKE1vZHVsZVsiZHluQ2FsbF9paWpqaWlpaSJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfaWlqamlpaWkiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbImR5bkNhbGxfamlqaSJdPWZ1bmN0aW9uKCl7cmV0dXJuIChNb2R1bGVbImR5bkNhbGxfamlqaSJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfamlqaSJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiZHluQ2FsbF9paWlpaWoiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX2lpaWlpaiJdPU1vZHVsZVsiYXNtIl1bImR5bkNhbGxfaWlpaWlqIl0pLmFwcGx5KG51bGwsYXJndW1lbnRzKX07TW9kdWxlWyJkeW5DYWxsX2lpaWlpamoiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX2lpaWlpamoiXT1Nb2R1bGVbImFzbSJdWyJkeW5DYWxsX2lpaWlpamoiXSkuYXBwbHkobnVsbCxhcmd1bWVudHMpfTtNb2R1bGVbImR5bkNhbGxfaWlpaWlpamoiXT1mdW5jdGlvbigpe3JldHVybiAoTW9kdWxlWyJkeW5DYWxsX2lpaWlpaWpqIl09TW9kdWxlWyJhc20iXVsiZHluQ2FsbF9paWlpaWlqaiJdKS5hcHBseShudWxsLGFyZ3VtZW50cyl9O01vZHVsZVsiX19fc3RhcnRfZW1fanMiXT0yMDk2NTc7TW9kdWxlWyJfX19zdG9wX2VtX2pzIl09MjA5NzE4O01vZHVsZVsiYWRkUnVuRGVwZW5kZW5jeSJdPWFkZFJ1bkRlcGVuZGVuY3k7TW9kdWxlWyJyZW1vdmVSdW5EZXBlbmRlbmN5Il09cmVtb3ZlUnVuRGVwZW5kZW5jeTtNb2R1bGVbIkZTX2NyZWF0ZVBhdGgiXT1GUy5jcmVhdGVQYXRoO01vZHVsZVsiRlNfY3JlYXRlRGF0YUZpbGUiXT1GUy5jcmVhdGVEYXRhRmlsZTtNb2R1bGVbIkZTX2NyZWF0ZVByZWxvYWRlZEZpbGUiXT1GUy5jcmVhdGVQcmVsb2FkZWRGaWxlO01vZHVsZVsiRlNfY3JlYXRlTGF6eUZpbGUiXT1GUy5jcmVhdGVMYXp5RmlsZTtNb2R1bGVbIkZTX2NyZWF0ZURldmljZSJdPUZTLmNyZWF0ZURldmljZTtNb2R1bGVbIkZTX3VubGluayJdPUZTLnVubGluaztNb2R1bGVbImtlZXBSdW50aW1lQWxpdmUiXT1rZWVwUnVudGltZUFsaXZlO01vZHVsZVsid2FzbU1lbW9yeSJdPXdhc21NZW1vcnk7TW9kdWxlWyJFeGl0U3RhdHVzIl09RXhpdFN0YXR1cztNb2R1bGVbIlBUaHJlYWQiXT1QVGhyZWFkO3ZhciBjYWxsZWRSdW47ZGVwZW5kZW5jaWVzRnVsZmlsbGVkPWZ1bmN0aW9uIHJ1bkNhbGxlcigpe2lmKCFjYWxsZWRSdW4pcnVuKCk7aWYoIWNhbGxlZFJ1bilkZXBlbmRlbmNpZXNGdWxmaWxsZWQ9cnVuQ2FsbGVyO307ZnVuY3Rpb24gcnVuKGFyZ3Mpe2lmKHJ1bkRlcGVuZGVuY2llcz4wKXtyZXR1cm59aWYoRU5WSVJPTk1FTlRfSVNfUFRIUkVBRCl7cmVhZHlQcm9taXNlUmVzb2x2ZShNb2R1bGUpO2luaXRSdW50aW1lKCk7cG9zdE1lc3NhZ2UoeyJjbWQiOiJsb2FkZWQifSk7cmV0dXJufXByZVJ1bigpO2lmKHJ1bkRlcGVuZGVuY2llcz4wKXtyZXR1cm59ZnVuY3Rpb24gZG9SdW4oKXtpZihjYWxsZWRSdW4pcmV0dXJuO2NhbGxlZFJ1bj10cnVlO01vZHVsZVsiY2FsbGVkUnVuIl09dHJ1ZTtpZihBQk9SVClyZXR1cm47aW5pdFJ1bnRpbWUoKTtyZWFkeVByb21pc2VSZXNvbHZlKE1vZHVsZSk7aWYoTW9kdWxlWyJvblJ1bnRpbWVJbml0aWFsaXplZCJdKU1vZHVsZVsib25SdW50aW1lSW5pdGlhbGl6ZWQiXSgpO3Bvc3RSdW4oKTt9aWYoTW9kdWxlWyJzZXRTdGF0dXMiXSl7TW9kdWxlWyJzZXRTdGF0dXMiXSgiUnVubmluZy4uLiIpO3NldFRpbWVvdXQoZnVuY3Rpb24oKXtzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7TW9kdWxlWyJzZXRTdGF0dXMiXSgiIik7fSwxKTtkb1J1bigpO30sMSk7fWVsc2Uge2RvUnVuKCk7fX1pZihNb2R1bGVbInByZUluaXQiXSl7aWYodHlwZW9mIE1vZHVsZVsicHJlSW5pdCJdPT0iZnVuY3Rpb24iKU1vZHVsZVsicHJlSW5pdCJdPVtNb2R1bGVbInByZUluaXQiXV07d2hpbGUoTW9kdWxlWyJwcmVJbml0Il0ubGVuZ3RoPjApe01vZHVsZVsicHJlSW5pdCJdLnBvcCgpKCk7fX1ydW4oKTsKCgogICAgcmV0dXJuIEx5cmFXYXNtTW9kdWxlLnJlYWR5CiAgfQogICk7CiAgfSkoKTsKCiAgLyoqCiAgICogTHlyYSDjga7jgqjjg7PjgrPjg7zjg4nlvaLlvI/jga7jg5Djg7zjgrjjg6fjg7PjgIIKICAgKgogICAqIOOCqOODs+OCs+ODvOODieW9ouW8j+OBq+mdnuS6kuaPm+OBquWkieabtOOBjOWFpeOBo+OBn+aZgueCueOBp+OBriBnb29nbGUvbHlyYSDjga7jg5Djg7zjgrjjg6fjg7PjgYzmoLzntI3jgZXjgozjgabjgYTjgovjgIIKICAgKi8KICBjb25zdCBERUZBVUxUX1NBTVBMRV9SQVRFID0gMTYwMDA7CiAgY29uc3QgREVGQVVMVF9CSVRSQVRFID0gOTIwMDsKICBjb25zdCBERUZBVUxUX0VOQUJMRV9EVFggPSBmYWxzZTsKICBjb25zdCBERUZBVUxUX0NIQU5ORUxTID0gMTsKICBmdW5jdGlvbiB0cmltTGFzdFNsYXNoKHMpIHsKICAgICAgaWYgKHMuc2xpY2UoLTEpID09PSAiLyIpIHsKICAgICAgICAgIHJldHVybiBzLnNsaWNlKDAsIC0xKTsKICAgICAgfQogICAgICByZXR1cm4gczsKICB9CiAgZnVuY3Rpb24gY2hlY2tTYW1wbGVSYXRlKG4pIHsKICAgICAgc3dpdGNoIChuKSB7CiAgICAgICAgICBjYXNlIHVuZGVmaW5lZDoKICAgICAgICAgIGNhc2UgODAwMDoKICAgICAgICAgIGNhc2UgMTYwMDA6CiAgICAgICAgICBjYXNlIDMyMDAwOgogICAgICAgICAgY2FzZSA0ODAwMDoKICAgICAgICAgICAgICByZXR1cm47CiAgICAgIH0KICAgICAgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBzYW1wbGUgcmF0ZTogZXhwZWN0ZWQgb25lIG9mIDgwMDAsIDE2MDAwLCAzMjAwMCBvciA0ODAwMCwgYnV0IGdvdCAke259YCk7CiAgfQogIGZ1bmN0aW9uIGNoZWNrTnVtYmVyT2ZDaGFubmVscyhuKSB7CiAgICAgIHN3aXRjaCAobikgewogICAgICAgICAgY2FzZSB1bmRlZmluZWQ6CiAgICAgICAgICBjYXNlIDE6CiAgICAgICAgICAgICAgcmV0dXJuOwogICAgICB9CiAgICAgIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgbnVtYmVyIG9mIGNoYW5uZWxzOiBleHBlY3RlZCAxLCBidXQgZ290ICR7bn1gKTsKICB9CiAgZnVuY3Rpb24gY2hlY2tCaXRyYXRlKG4pIHsKICAgICAgc3dpdGNoIChuKSB7CiAgICAgICAgICBjYXNlIHVuZGVmaW5lZDoKICAgICAgICAgIGNhc2UgMzIwMDoKICAgICAgICAgIGNhc2UgNjAwMDoKICAgICAgICAgIGNhc2UgOTIwMDoKICAgICAgICAgICAgICByZXR1cm47CiAgICAgIH0KICAgICAgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBiaXRyYXRlOiBleHBlY3RlZCBvbmUgb2YgMzIwMCwgNjAwMCBvciA5MjAwLCBidXQgZ290ICR7bn1gKTsKICB9CgogIGNvbnN0IE1FTUZTX01PREVMX1BBVEggPSAiL3RtcC8iOwogIGNvbnN0IEZSQU1FX0RVUkFUSU9OX01TID0gMjA7CiAgY2xhc3MgTHlyYVN5bmNNb2R1bGUgewogICAgICB3YXNtTW9kdWxlOwogICAgICBjb25zdHJ1Y3Rvcih3YXNtTW9kdWxlKSB7CiAgICAgICAgICB0aGlzLndhc21Nb2R1bGUgPSB3YXNtTW9kdWxlOwogICAgICB9CiAgICAgIHN0YXRpYyBhc3luYyBsb2FkKHdhc21QYXRoLCBtb2RlbFBhdGgpIHsKICAgICAgICAgIGNvbnN0IHdhc21Nb2R1bGUgPSBhd2FpdCBMeXJhV2FzbU1vZHVsZSh7CiAgICAgICAgICAgICAgbG9jYXRlRmlsZTogKHBhdGgpID0+IHsKICAgICAgICAgICAgICAgICAgcmV0dXJuIHRyaW1MYXN0U2xhc2god2FzbVBhdGgpICsgIi8iICsgcGF0aDsKICAgICAgICAgICAgICB9LAogICAgICAgICAgfSk7CiAgICAgICAgICBjb25zdCBtb2RlbEZpbGVOYW1lcyA9IFsibHlyYV9jb25maWcuYmluYXJ5cGIiLCAic291bmRzdHJlYW1fZW5jb2Rlci50ZmxpdGUiLCAicXVhbnRpemVyLnRmbGl0ZSIsICJseXJhZ2FuLnRmbGl0ZSJdOwogICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwobW9kZWxGaWxlTmFtZXMubWFwKChuYW1lKSA9PiB7CiAgICAgICAgICAgICAgY29uc3QgdXJsID0gdHJpbUxhc3RTbGFzaChtb2RlbFBhdGgpICsgIi8iICsgbmFtZTsKICAgICAgICAgICAgICByZXR1cm4gZmV0Y2godXJsKS50aGVuKGFzeW5jIChyZXMpID0+IHsKICAgICAgICAgICAgICAgICAgaWYgKCFyZXMub2spIHsKICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgZmFpbGVkIHRvIGZldGNoICR7dXJsfTogJHtyZXMuc3RhdHVzfSAke3Jlcy5zdGF0dXNUZXh0fWApOwogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIHdhc21Nb2R1bGUuRlNfY3JlYXRlRGF0YUZpbGUoTUVNRlNfTU9ERUxfUEFUSCwgbmFtZSwgbmV3IFVpbnQ4QXJyYXkoYXdhaXQgcmVzLmFycmF5QnVmZmVyKCkpLCB0cnVlLCBmYWxzZSwgZmFsc2UpOwogICAgICAgICAgICAgIH0pOwogICAgICAgICAgfSkpOwogICAgICAgICAgcmV0dXJuIG5ldyBMeXJhU3luY01vZHVsZSh3YXNtTW9kdWxlKTsKICAgICAgfQogICAgICBjcmVhdGVFbmNvZGVyKG9wdGlvbnMgPSB7fSkgewogICAgICAgICAgY2hlY2tTYW1wbGVSYXRlKG9wdGlvbnMuc2FtcGxlUmF0ZSk7CiAgICAgICAgICBjaGVja051bWJlck9mQ2hhbm5lbHMob3B0aW9ucy5udW1iZXJPZkNoYW5uZWxzKTsKICAgICAgICAgIGNoZWNrQml0cmF0ZShvcHRpb25zLmJpdHJhdGUpOwogICAgICAgICAgY29uc3QgZW5jb2RlciA9IHRoaXMud2FzbU1vZHVsZS5MeXJhRW5jb2Rlci5jcmVhdGUob3B0aW9ucy5zYW1wbGVSYXRlIHx8IERFRkFVTFRfU0FNUExFX1JBVEUsIG9wdGlvbnMubnVtYmVyT2ZDaGFubmVscyB8fCBERUZBVUxUX0NIQU5ORUxTLCBvcHRpb25zLmJpdHJhdGUgfHwgREVGQVVMVF9CSVRSQVRFLCBvcHRpb25zLmVuYWJsZUR0eCB8fCBERUZBVUxUX0VOQUJMRV9EVFgsIE1FTUZTX01PREVMX1BBVEgpOwogICAgICAgICAgaWYgKGVuY29kZXIgPT09IHVuZGVmaW5lZCkgewogICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigiZmFpbGVkIHRvIGNyZWF0ZSBseXJhIGVuY29kZXIiKTsKICAgICAgICAgIH0KICAgICAgICAgIGVsc2UgewogICAgICAgICAgICAgIGNvbnN0IGZyYW1lU2l6ZSA9ICgob3B0aW9ucy5zYW1wbGVSYXRlIHx8IERFRkFVTFRfU0FNUExFX1JBVEUpICogRlJBTUVfRFVSQVRJT05fTVMpIC8gMTAwMDsKICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSB0aGlzLndhc21Nb2R1bGUubmV3QXVkaW9EYXRhKGZyYW1lU2l6ZSk7CiAgICAgICAgICAgICAgcmV0dXJuIG5ldyBMeXJhU3luY0VuY29kZXIodGhpcy53YXNtTW9kdWxlLCBlbmNvZGVyLCBidWZmZXIsIG9wdGlvbnMpOwogICAgICAgICAgfQogICAgICB9CiAgICAgIGNyZWF0ZURlY29kZXIob3B0aW9ucyA9IHt9KSB7CiAgICAgICAgICBjaGVja1NhbXBsZVJhdGUob3B0aW9ucy5zYW1wbGVSYXRlKTsKICAgICAgICAgIGNoZWNrTnVtYmVyT2ZDaGFubmVscyhvcHRpb25zLm51bWJlck9mQ2hhbm5lbHMpOwogICAgICAgICAgY29uc3QgZGVjb2RlciA9IHRoaXMud2FzbU1vZHVsZS5MeXJhRGVjb2Rlci5jcmVhdGUob3B0aW9ucy5zYW1wbGVSYXRlIHx8IERFRkFVTFRfU0FNUExFX1JBVEUsIG9wdGlvbnMubnVtYmVyT2ZDaGFubmVscyB8fCBERUZBVUxUX0NIQU5ORUxTLCBNRU1GU19NT0RFTF9QQVRIKTsKICAgICAgICAgIGlmIChkZWNvZGVyID09PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoImZhaWxlZCB0byBjcmVhdGUgbHlyYSBkZWNvZGVyIik7CiAgICAgICAgICB9CiAgICAgICAgICBlbHNlIHsKICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSB0aGlzLndhc21Nb2R1bGUubmV3Qnl0ZXMoKTsKICAgICAgICAgICAgICByZXR1cm4gbmV3IEx5cmFTeW5jRGVjb2Rlcih0aGlzLndhc21Nb2R1bGUsIGRlY29kZXIsIGJ1ZmZlciwgb3B0aW9ucyk7CiAgICAgICAgICB9CiAgICAgIH0KICB9CiAgY2xhc3MgTHlyYVN5bmNFbmNvZGVyIHsKICAgICAgd2FzbU1vZHVsZTsKICAgICAgZW5jb2RlcjsKICAgICAgYnVmZmVyOwogICAgICBzYW1wbGVSYXRlOwogICAgICBudW1iZXJPZkNoYW5uZWxzOwogICAgICBiaXRyYXRlOwogICAgICBlbmFibGVEdHg7CiAgICAgIGZyYW1lU2l6ZTsKICAgICAgY29uc3RydWN0b3Iod2FzbU1vZHVsZSwgZW5jb2RlciwgYnVmZmVyLCBvcHRpb25zKSB7CiAgICAgICAgICB0aGlzLndhc21Nb2R1bGUgPSB3YXNtTW9kdWxlOwogICAgICAgICAgdGhpcy5lbmNvZGVyID0gZW5jb2RlcjsKICAgICAgICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyOwogICAgICAgICAgdGhpcy5zYW1wbGVSYXRlID0gb3B0aW9ucy5zYW1wbGVSYXRlIHx8IERFRkFVTFRfU0FNUExFX1JBVEU7CiAgICAgICAgICB0aGlzLm51bWJlck9mQ2hhbm5lbHMgPSBvcHRpb25zLm51bWJlck9mQ2hhbm5lbHMgfHwgREVGQVVMVF9DSEFOTkVMUzsKICAgICAgICAgIHRoaXMuYml0cmF0ZSA9IG9wdGlvbnMuYml0cmF0ZSB8fCBERUZBVUxUX0JJVFJBVEU7CiAgICAgICAgICB0aGlzLmVuYWJsZUR0eCA9IG9wdGlvbnMuZW5hYmxlRHR4IHx8IERFRkFVTFRfRU5BQkxFX0RUWDsKICAgICAgICAgIHRoaXMuZnJhbWVTaXplID0gYnVmZmVyLnNpemUoKTsKICAgICAgfQogICAgICBlbmNvZGUoYXVkaW9EYXRhKSB7CiAgICAgICAgICBpZiAoYXVkaW9EYXRhLmxlbmd0aCAhPT0gdGhpcy5mcmFtZVNpemUpIHsKICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGV4cGVjdGVkIGFuIGF1ZGlvIGRhdGEgd2l0aCAke3RoaXMuZnJhbWVTaXplfSBzYW1wbGVzLCBidXQgZ290IG9uZSB3aXRoICR7YXVkaW9EYXRhLmxlbmd0aH0gc2FtcGxlc2ApOwogICAgICAgICAgfQogICAgICAgICAgdGhpcy53YXNtTW9kdWxlLmNvcHlJbnQxNkFycmF5VG9BdWRpb0RhdGEodGhpcy5idWZmZXIsIGF1ZGlvRGF0YSk7CiAgICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmVuY29kZXIuZW5jb2RlKHRoaXMuYnVmZmVyKTsKICAgICAgICAgIGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkgewogICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigiZmFpbGVkIHRvIGVuY29kZSIpOwogICAgICAgICAgfQogICAgICAgICAgZWxzZSB7CiAgICAgICAgICAgICAgdHJ5IHsKICAgICAgICAgICAgICAgICAgY29uc3QgZW5jb2RlZEF1ZGlvRGF0YSA9IG5ldyBVaW50OEFycmF5KHJlc3VsdC5zaXplKCkpOwogICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVuY29kZWRBdWRpb0RhdGEubGVuZ3RoOyBpKyspIHsKICAgICAgICAgICAgICAgICAgICAgIGVuY29kZWRBdWRpb0RhdGFbaV0gPSByZXN1bHQuZ2V0KGkpOwogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIGlmIChlbmNvZGVkQXVkaW9EYXRhLmxlbmd0aCA9PT0gMCkgewogICAgICAgICAgICAgICAgICAgICAgLy8gRFRYIOOBjOacieWKueOAgeOBi+OBpOOAgSBhdWRpb0RhdGEg44GM54Sh6Z+z44Gq44GE44GX44OO44Kk44K644Gg44GR44KS5ZCr44KT44Gn44GE44KL5aC05ZCI44Gr44Gv44GT44GT44Gr5p2l44KLCiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkOwogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIHJldHVybiBlbmNvZGVkQXVkaW9EYXRhOwogICAgICAgICAgICAgIH0KICAgICAgICAgICAgICBmaW5hbGx5IHsKICAgICAgICAgICAgICAgICAgcmVzdWx0LmRlbGV0ZSgpOwogICAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgfQogICAgICBzZXRCaXRyYXRlKGJpdHJhdGUpIHsKICAgICAgICAgIGNoZWNrQml0cmF0ZShiaXRyYXRlKTsKICAgICAgICAgIGlmICghdGhpcy5lbmNvZGVyLnNldEJpdHJhdGUoYml0cmF0ZSkpIHsKICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGZhaWxlZCB0byB1cGRhdGUgYml0cmF0ZSBmcm9tICR7dGhpcy5iaXRyYXRlfSB0byAke2JpdHJhdGV9YCk7CiAgICAgICAgICB9CiAgICAgIH0KICAgICAgZGVzdHJveSgpIHsKICAgICAgICAgIHRoaXMuZW5jb2Rlci5kZWxldGUoKTsKICAgICAgICAgIHRoaXMuYnVmZmVyLmRlbGV0ZSgpOwogICAgICB9CiAgfQogIGNsYXNzIEx5cmFTeW5jRGVjb2RlciB7CiAgICAgIHdhc21Nb2R1bGU7CiAgICAgIGRlY29kZXI7CiAgICAgIGJ1ZmZlcjsKICAgICAgc2FtcGxlUmF0ZTsKICAgICAgbnVtYmVyT2ZDaGFubmVsczsKICAgICAgZnJhbWVTaXplOwogICAgICBjb25zdHJ1Y3Rvcih3YXNtTW9kdWxlLCBkZWNvZGVyLCBidWZmZXIsIG9wdGlvbnMpIHsKICAgICAgICAgIHRoaXMud2FzbU1vZHVsZSA9IHdhc21Nb2R1bGU7CiAgICAgICAgICB0aGlzLmRlY29kZXIgPSBkZWNvZGVyOwogICAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7CiAgICAgICAgICB0aGlzLnNhbXBsZVJhdGUgPSBvcHRpb25zLnNhbXBsZVJhdGUgfHwgREVGQVVMVF9TQU1QTEVfUkFURTsKICAgICAgICAgIHRoaXMubnVtYmVyT2ZDaGFubmVscyA9IG9wdGlvbnMubnVtYmVyT2ZDaGFubmVscyB8fCBERUZBVUxUX0NIQU5ORUxTOwogICAgICAgICAgdGhpcy5mcmFtZVNpemUgPSAodGhpcy5zYW1wbGVSYXRlICogRlJBTUVfRFVSQVRJT05fTVMpIC8gMTAwMDsKICAgICAgfQogICAgICBkZWNvZGUoZW5jb2RlZEF1ZGlvRGF0YSkgewogICAgICAgICAgaWYgKGVuY29kZWRBdWRpb0RhdGEgIT09IHVuZGVmaW5lZCkgewogICAgICAgICAgICAgIHRoaXMuYnVmZmVyLnJlc2l6ZSgwLCAwKTsgLy8gY2xlYXIoKSDjgpLkvb/jgYbjgajjgIzplqLmlbDjgYzlrZjlnKjjgZfjgarjgYTjgI3jgajjgYTjgYbjgqjjg6njg7zjgYzlh7rjgovjga7jgacgcmVzaXplKCkg44Gn5Luj55SoCiAgICAgICAgICAgICAgZm9yIChjb25zdCB2IG9mIGVuY29kZWRBdWRpb0RhdGEpIHsKICAgICAgICAgICAgICAgICAgdGhpcy5idWZmZXIucHVzaF9iYWNrKHYpOwogICAgICAgICAgICAgIH0KICAgICAgICAgICAgICBpZiAoIXRoaXMuZGVjb2Rlci5zZXRFbmNvZGVkUGFja2V0KHRoaXMuYnVmZmVyKSkgewogICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoImZhaWxlZCB0byBzZXQgZW5jb2RlZCBwYWNrZXQiKTsKICAgICAgICAgICAgICB9CiAgICAgICAgICB9CiAgICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmRlY29kZXIuZGVjb2RlU2FtcGxlcyh0aGlzLmZyYW1lU2l6ZSk7CiAgICAgICAgICBpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICB0aHJvdyBFcnJvcigiZmFpbGVkIHRvIGRlY29kZSBzYW1wbGVzIik7CiAgICAgICAgICB9CiAgICAgICAgICB0cnkgewogICAgICAgICAgICAgIGNvbnN0IGF1ZGlvRGF0YSA9IG5ldyBJbnQxNkFycmF5KHRoaXMuZnJhbWVTaXplKTsKICAgICAgICAgICAgICB0aGlzLndhc21Nb2R1bGUuY29weUF1ZGlvRGF0YVRvSW50MTZBcnJheShhdWRpb0RhdGEsIHJlc3VsdCk7CiAgICAgICAgICAgICAgcmV0dXJuIGF1ZGlvRGF0YTsKICAgICAgICAgIH0KICAgICAgICAgIGZpbmFsbHkgewogICAgICAgICAgICAgIHJlc3VsdC5kZWxldGUoKTsKICAgICAgICAgIH0KICAgICAgfQogICAgICBkZXN0cm95KCkgewogICAgICAgICAgdGhpcy5kZWNvZGVyLmRlbGV0ZSgpOwogICAgICAgICAgdGhpcy5idWZmZXIuZGVsZXRlKCk7CiAgICAgIH0KICB9CgogIC8vIOOCqOODs+OCs+ODvOODgOOBqOODh+OCs+ODvOODgOOBruOCpOODs+OCueOCv+ODs+OCueOBruWQiOioiOaVsOOBruacgOWkp+WApAogIC8vCiAgLy8g44GT44Gu5YCk44KS5aSJ5pu044GZ44KL5aC05ZCI44Gr44GvIHdhc20vQlVJTEQg44Gr44GC44KLIGAtcyBJTklUSUFMX01FTU9SWWAg44Gu5YCk44KC5ZCI44KP44Gb44Gm5aSJ5pu044GZ44KL44GT44GoCiAgY29uc3QgTUFYX1JFU09VUkNFUyA9IDEwOwogIGxldCBSRVNPVVJDRV9NQU5BR0VSOwogIGNsYXNzIFJlc291cmNlTWFuYWdlciB7CiAgICAgIGx5cmFNb2R1bGU7CiAgICAgIGVuY29kZXJzID0gbmV3IE1hcCgpOwogICAgICBkZWNvZGVycyA9IG5ldyBNYXAoKTsKICAgICAgY29uc3RydWN0b3IobHlyYU1vZHVsZSkgewogICAgICAgICAgdGhpcy5seXJhTW9kdWxlID0gbHlyYU1vZHVsZTsKICAgICAgfQogICAgICBjcmVhdGVFbmNvZGVyKHBvcnQsIG9wdGlvbnMpIHsKICAgICAgICAgIHRoaXMuZXZpY3RJZk5lZWQoKTsKICAgICAgICAgIGNvbnN0IGVuY29kZXIgPSB0aGlzLmx5cmFNb2R1bGUuY3JlYXRlRW5jb2RlcihvcHRpb25zKTsKICAgICAgICAgIHRoaXMuZW5jb2RlcnMuc2V0KHBvcnQsIG5ldyBSZXNvdXJjZShlbmNvZGVyKSk7CiAgICAgICAgICByZXR1cm4gZW5jb2RlcjsKICAgICAgfQogICAgICBjcmVhdGVEZWNvZGVyKHBvcnQsIG9wdGlvbnMpIHsKICAgICAgICAgIHRoaXMuZXZpY3RJZk5lZWQoKTsKICAgICAgICAgIGNvbnN0IGRlY29kZXIgPSB0aGlzLmx5cmFNb2R1bGUuY3JlYXRlRGVjb2RlcihvcHRpb25zKTsKICAgICAgICAgIHRoaXMuZGVjb2RlcnMuc2V0KHBvcnQsIG5ldyBSZXNvdXJjZShkZWNvZGVyKSk7CiAgICAgICAgICByZXR1cm4gZGVjb2RlcjsKICAgICAgfQogICAgICBnZXRFbmNvZGVyKHBvcnQsIG9wdGlvbnMpIHsKICAgICAgICAgIGNvbnN0IGVuY29kZXIgPSB0aGlzLmVuY29kZXJzLmdldChwb3J0KTsKICAgICAgICAgIGlmIChlbmNvZGVyICE9PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICBlbmNvZGVyLmxhc3RBY2Nlc3NlZFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsKICAgICAgICAgICAgICByZXR1cm4gZW5jb2Rlci5pdGVtOwogICAgICAgICAgfQogICAgICAgICAgZWxzZSB7CiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlRW5jb2Rlcihwb3J0LCBvcHRpb25zKTsKICAgICAgICAgIH0KICAgICAgfQogICAgICBnZXREZWNvZGVyKHBvcnQsIG9wdGlvbnMpIHsKICAgICAgICAgIGNvbnN0IGRlY29kZXIgPSB0aGlzLmRlY29kZXJzLmdldChwb3J0KTsKICAgICAgICAgIGlmIChkZWNvZGVyICE9PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICBkZWNvZGVyLmxhc3RBY2Nlc3NlZFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsKICAgICAgICAgICAgICByZXR1cm4gZGVjb2Rlci5pdGVtOwogICAgICAgICAgfQogICAgICAgICAgZWxzZSB7CiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlRGVjb2Rlcihwb3J0LCBvcHRpb25zKTsKICAgICAgICAgIH0KICAgICAgfQogICAgICByZW1vdmUocG9ydCkgewogICAgICAgICAgewogICAgICAgICAgICAgIGNvbnN0IHJlc291cmNlID0gdGhpcy5lbmNvZGVycy5nZXQocG9ydCk7CiAgICAgICAgICAgICAgaWYgKHJlc291cmNlICE9PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICAgICAgcmVzb3VyY2UuaXRlbS5kZXN0cm95KCk7CiAgICAgICAgICAgICAgICAgIHRoaXMuZW5jb2RlcnMuZGVsZXRlKHBvcnQpOwogICAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgICAgIHsKICAgICAgICAgICAgICBjb25zdCByZXNvdXJjZSA9IHRoaXMuZGVjb2RlcnMuZ2V0KHBvcnQpOwogICAgICAgICAgICAgIGlmIChyZXNvdXJjZSAhPT0gdW5kZWZpbmVkKSB7CiAgICAgICAgICAgICAgICAgIHJlc291cmNlLml0ZW0uZGVzdHJveSgpOwogICAgICAgICAgICAgICAgICB0aGlzLmRlY29kZXJzLmRlbGV0ZShwb3J0KTsKICAgICAgICAgICAgICB9CiAgICAgICAgICB9CiAgICAgIH0KICAgICAgZXZpY3RJZk5lZWQoKSB7CiAgICAgICAgICBpZiAodGhpcy5lbmNvZGVycy5zaXplICsgdGhpcy5kZWNvZGVycy5zaXplIDwgTUFYX1JFU09VUkNFUykgewogICAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgIH0KICAgICAgICAgIC8vIOOCpOODs+OCueOCv+ODs+OCueaVsOOBruS4iumZkOOBq+mBlOOBl+OBpuOBhOOCi+WgtOWQiOOBq+OBr+OAgeS9v+eUqOOBleOCjOOBn+aZguWIu+OBjOS4gOeVquWPpOOBhOOCguOBruOCkuWJiumZpOOBmeOCiwogICAgICAgICAgbGV0IG9sZGVzdFBvcnQ7CiAgICAgICAgICBsZXQgb2xkZXN0VGltZTsKICAgICAgICAgIGZvciAoY29uc3QgW3BvcnQsIHJlc291cmNlXSBvZiB0aGlzLmVuY29kZXJzLmVudHJpZXMoKSkgewogICAgICAgICAgICAgIGlmIChvbGRlc3RUaW1lID09PSB1bmRlZmluZWQgfHwgcmVzb3VyY2UubGFzdEFjY2Vzc2VkVGltZSA8IG9sZGVzdFRpbWUpIHsKICAgICAgICAgICAgICAgICAgb2xkZXN0UG9ydCA9IHBvcnQ7CiAgICAgICAgICAgICAgICAgIG9sZGVzdFRpbWUgPSByZXNvdXJjZS5sYXN0QWNjZXNzZWRUaW1lOwogICAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgICAgIGZvciAoY29uc3QgW3BvcnQsIHJlc291cmNlXSBvZiB0aGlzLmRlY29kZXJzLmVudHJpZXMoKSkgewogICAgICAgICAgICAgIGlmIChvbGRlc3RUaW1lID09PSB1bmRlZmluZWQgfHwgcmVzb3VyY2UubGFzdEFjY2Vzc2VkVGltZSA8IG9sZGVzdFRpbWUpIHsKICAgICAgICAgICAgICAgICAgb2xkZXN0UG9ydCA9IHBvcnQ7CiAgICAgICAgICAgICAgICAgIG9sZGVzdFRpbWUgPSByZXNvdXJjZS5sYXN0QWNjZXNzZWRUaW1lOwogICAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgICAgIGlmIChvbGRlc3RQb3J0ICE9PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICB0aGlzLnJlbW92ZShvbGRlc3RQb3J0KTsKICAgICAgICAgIH0KICAgICAgfQogIH0KICBjbGFzcyBSZXNvdXJjZSB7CiAgICAgIGl0ZW07CiAgICAgIGxhc3RBY2Nlc3NlZFRpbWU7CiAgICAgIGNvbnN0cnVjdG9yKGl0ZW0pIHsKICAgICAgICAgIHRoaXMuaXRlbSA9IGl0ZW07CiAgICAgICAgICB0aGlzLmxhc3RBY2Nlc3NlZFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsKICAgICAgfQogIH0KICBhc3luYyBmdW5jdGlvbiBpbml0UmVzb3VyY2VNYW5hZ2VyKHdhc21QYXRoLCBtb2RlbFBhdGgpIHsKICAgICAgUkVTT1VSQ0VfTUFOQUdFUiA9IG5ldyBSZXNvdXJjZU1hbmFnZXIoYXdhaXQgTHlyYVN5bmNNb2R1bGUubG9hZCh3YXNtUGF0aCwgbW9kZWxQYXRoKSk7CiAgfQogIHNlbGYub25tZXNzYWdlID0gYXN5bmMgZnVuY3Rpb24gaGFuZGxlTW9kdWxlTWVzc2FnZShtc2cpIHsKICAgICAgc3dpdGNoIChtc2cuZGF0YS50eXBlKSB7CiAgICAgICAgICBjYXNlICJMeXJhTW9kdWxlLmxvYWQiOgogICAgICAgICAgICAgIHRyeSB7CiAgICAgICAgICAgICAgICAgIGF3YWl0IGluaXRSZXNvdXJjZU1hbmFnZXIobXNnLmRhdGEud2FzbVBhdGgsIG1zZy5kYXRhLm1vZGVsUGF0aCk7CiAgICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2UoeyB0eXBlOiBgJHttc2cuZGF0YS50eXBlfS5yZXN1bHRgLCByZXN1bHQ6IHt9IH0pOwogICAgICAgICAgICAgIH0KICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHsKICAgICAgICAgICAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7IHR5cGU6IGAke21zZy5kYXRhLnR5cGV9LnJlc3VsdGAsIHJlc3VsdDogeyBlcnJvciB9IH0pOwogICAgICAgICAgICAgIH0KICAgICAgICAgICAgICBicmVhazsKICAgICAgICAgIGNhc2UgIkx5cmFNb2R1bGUuY3JlYXRlRW5jb2RlciI6CiAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICBjb25zdCBwb3J0ID0gbXNnLmRhdGEucG9ydDsKICAgICAgICAgICAgICAgICAgdHJ5IHsKICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hbmFnZXIgPSBSRVNPVVJDRV9NQU5BR0VSOwogICAgICAgICAgICAgICAgICAgICAgaWYgKG1hbmFnZXIgPT09IHVuZGVmaW5lZCkgewogICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigiUkVTT1VSQ0VfTUFOQUdFUiBpcyB1bmRlZmluZWQiKTsKICAgICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSBtc2cuZGF0YS5vcHRpb25zOwogICAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5jb2RlciA9IG1hbmFnZXIuY3JlYXRlRW5jb2Rlcihwb3J0LCBvcHRpb25zKTsKICAgICAgICAgICAgICAgICAgICAgIHBvcnQub25tZXNzYWdlID0gKG1zZykgPT4gewogICAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZUVuY29kZXJNZXNzYWdlKG1hbmFnZXIsIHBvcnQsIG9wdGlvbnMsIG1zZyk7CiAgICAgICAgICAgICAgICAgICAgICB9OwogICAgICAgICAgICAgICAgICAgICAgcG9ydC5wb3N0TWVzc2FnZSh7IHR5cGU6IGAke21zZy5kYXRhLnR5cGV9LnJlc3VsdGAsIHJlc3VsdDogeyBmcmFtZVNpemU6IGVuY29kZXIuZnJhbWVTaXplIH0gfSk7CiAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7CiAgICAgICAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHsgdHlwZTogYCR7bXNnLmRhdGEudHlwZX0ucmVzdWx0YCwgcmVzdWx0OiB7IGVycm9yIH0gfSk7CiAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgYnJlYWs7CiAgICAgICAgICBjYXNlICJMeXJhTW9kdWxlLmNyZWF0ZURlY29kZXIiOgogICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgY29uc3QgcG9ydCA9IG1zZy5kYXRhLnBvcnQ7CiAgICAgICAgICAgICAgICAgIHRyeSB7CiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtYW5hZ2VyID0gUkVTT1VSQ0VfTUFOQUdFUjsKICAgICAgICAgICAgICAgICAgICAgIGlmIChtYW5hZ2VyID09PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlJFU09VUkNFX01BTkFHRVIgaXMgdW5kZWZpbmVkIik7CiAgICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvcHRpb25zID0gbXNnLmRhdGEub3B0aW9uczsKICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY29kZXIgPSBtYW5hZ2VyLmNyZWF0ZURlY29kZXIocG9ydCwgb3B0aW9ucyk7CiAgICAgICAgICAgICAgICAgICAgICBwb3J0Lm9ubWVzc2FnZSA9IChtc2cpID0+IHsKICAgICAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVEZWNvZGVyTWVzc2FnZShtYW5hZ2VyLCBwb3J0LCBvcHRpb25zLCBtc2cpOwogICAgICAgICAgICAgICAgICAgICAgfTsKICAgICAgICAgICAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UoeyB0eXBlOiBgJHttc2cuZGF0YS50eXBlfS5yZXN1bHRgLCByZXN1bHQ6IHsgZnJhbWVTaXplOiBkZWNvZGVyLmZyYW1lU2l6ZSB9IH0pOwogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikgewogICAgICAgICAgICAgICAgICAgICAgcG9ydC5wb3N0TWVzc2FnZSh7IHR5cGU6IGAke21zZy5kYXRhLnR5cGV9LnJlc3VsdGAsIHJlc3VsdDogeyBlcnJvciB9IH0pOwogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIGJyZWFrOwogICAgICAgICAgZGVmYXVsdDoKICAgICAgICAgICAgICBjb25zb2xlLndhcm4oInJlY2VpdmVkIHVua25vd24gbWVzc2FnZSIpOwogICAgICAgICAgICAgIGNvbnNvbGUud2Fybihtc2cpOwogICAgICB9CiAgfTsKICBmdW5jdGlvbiBoYW5kbGVFbmNvZGVyTWVzc2FnZShtYW5hZ2VyLCBwb3J0LCBvcHRpb25zLCBtc2cpIHsKICAgICAgc3dpdGNoIChtc2cuZGF0YS50eXBlKSB7CiAgICAgICAgICBjYXNlICJMeXJhRW5jb2Rlci5lbmNvZGUiOgogICAgICAgICAgICAgIHRyeSB7CiAgICAgICAgICAgICAgICAgIGNvbnN0IGVuY29kZXIgPSBtYW5hZ2VyLmdldEVuY29kZXIocG9ydCwgb3B0aW9ucyk7CiAgICAgICAgICAgICAgICAgIGNvbnN0IGVuY29kZWRBdWRpb0RhdGEgPSBlbmNvZGVyLmVuY29kZShtc2cuZGF0YS5hdWRpb0RhdGEpOwogICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IHsgdHlwZTogYCR7bXNnLmRhdGEudHlwZX0ucmVzdWx0YCwgcmVzdWx0OiB7IGVuY29kZWRBdWRpb0RhdGEgfSB9OwogICAgICAgICAgICAgICAgICBpZiAoZW5jb2RlZEF1ZGlvRGF0YSA9PT0gdW5kZWZpbmVkKSB7CiAgICAgICAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHJlc3BvbnNlKTsKICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICBlbHNlIHsKICAgICAgICAgICAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UocmVzcG9uc2UsIFtlbmNvZGVkQXVkaW9EYXRhLmJ1ZmZlcl0pOwogICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIGNhdGNoIChlcnJvcikgewogICAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHsgdHlwZTogYCR7bXNnLmRhdGEudHlwZX0ucmVzdWx0YCwgcmVzdWx0OiB7IGVycm9yIH0gfSk7CiAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIGJyZWFrOwogICAgICAgICAgY2FzZSAiTHlyYUVuY29kZXIuZGVzdHJveSI6CiAgICAgICAgICAgICAgbWFuYWdlci5yZW1vdmUocG9ydCk7CiAgICAgICAgICAgICAgcG9ydC5vbm1lc3NhZ2UgPSBudWxsOwogICAgICAgICAgICAgIGJyZWFrOwogICAgICAgICAgZGVmYXVsdDoKICAgICAgICAgICAgICBjb25zb2xlLndhcm4oInJlY2VpdmVkIHVua25vd24gbWVzc2FnZSIpOwogICAgICAgICAgICAgIGNvbnNvbGUud2Fybihtc2cpOwogICAgICB9CiAgfQogIGZ1bmN0aW9uIGhhbmRsZURlY29kZXJNZXNzYWdlKG1hbmFnZXIsIHBvcnQsIG9wdGlvbnMsIG1zZykgewogICAgICBzd2l0Y2ggKG1zZy5kYXRhLnR5cGUpIHsKICAgICAgICAgIGNhc2UgIkx5cmFEZWNvZGVyLmRlY29kZSI6CiAgICAgICAgICAgICAgdHJ5IHsKICAgICAgICAgICAgICAgICAgY29uc3QgZGVjb2RlciA9IG1hbmFnZXIuZ2V0RGVjb2Rlcihwb3J0LCBvcHRpb25zKTsKICAgICAgICAgICAgICAgICAgY29uc3QgYXVkaW9EYXRhID0gZGVjb2Rlci5kZWNvZGUobXNnLmRhdGEuZW5jb2RlZEF1ZGlvRGF0YSk7CiAgICAgICAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UoeyB0eXBlOiBgJHttc2cuZGF0YS50eXBlfS5yZXN1bHRgLCByZXN1bHQ6IHsgYXVkaW9EYXRhIH0gfSwgW2F1ZGlvRGF0YS5idWZmZXJdKTsKICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7CiAgICAgICAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UoeyB0eXBlOiBgJHttc2cuZGF0YS50eXBlfS5yZXN1bHRgLCByZXN1bHQ6IHsgZXJyb3IgfSB9KTsKICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgYnJlYWs7CiAgICAgICAgICBjYXNlICJMeXJhRGVjb2Rlci5kZXN0cm95IjoKICAgICAgICAgICAgICBtYW5hZ2VyLnJlbW92ZShwb3J0KTsKICAgICAgICAgICAgICBwb3J0Lm9ubWVzc2FnZSA9IG51bGw7CiAgICAgICAgICAgICAgYnJlYWs7CiAgICAgICAgICBkZWZhdWx0OgogICAgICAgICAgICAgIGNvbnNvbGUud2FybigicmVjZWl2ZWQgdW5rbm93biBtZXNzYWdlIik7CiAgICAgICAgICAgICAgY29uc29sZS53YXJuKG1zZyk7CiAgICAgIH0KICB9Cgp9KSk7Cg==";
	/**
	 * Lyra 用の WebAssembly ファイルやモデルファイルのロードや web worker の管理を行うためのクラス
	 */
	class LyraModule {
	    worker;
	    constructor(worker) {
	        this.worker = worker;
	    }
	    /**
	     * Lyra の WebAssembly ファイルやモデルファイルをロードや web worker の起動を行い、 {@link LyraModule} のインスタンスを生成する
	     *
	     * @param wasmPath lyra.wasm および lyra.worker.js が配置されているディレクトリのパスないし URL
	     * @param modelPath Lyra 用の *.binarypb および *.tflite が配置されているディレクトリのパスないし URL
	     * @returns 生成された {@link LyraModule} インスタンス
	     */
	    static load(wasmPath, modelPath) {
	        // lyra は SharedArrayBufffer を使うので COEP / COOP 応答ヘッダ周りの対処が必要になるが、
	        // chrome / firefox と safari で挙動が異なる（前者は COEP / COOP ヘッダが必要で、後者はそれがあるとエラーになる）ので
	        // その問題を回避するために object url で worker を生成するようにする
	        const webWorkerScriptObjectUrl = URL.createObjectURL(new Blob([atob(WEB_WORKER_SCRIPT)], { type: "application/javascript" }));
	        const worker = new Worker(webWorkerScriptObjectUrl, {
	            name: "lyra_sync_worker",
	        });
	        // 各種ファイルは web worker の中でロードされることになるので、
	        // 事前に絶対 URL に変換しておく必要がある
	        wasmPath = new URL(wasmPath, document.location.href).toString();
	        modelPath = new URL(modelPath, document.location.href).toString();
	        const promise = new Promise((resolve, reject) => {
	            worker.addEventListener("message", (res) => {
	                const error = res.data.result.error;
	                if (error === undefined) {
	                    resolve(new LyraModule(worker));
	                }
	                else {
	                    reject(error);
	                }
	            }, { once: true });
	        });
	        worker.postMessage({ type: "LyraModule.load", modelPath, wasmPath });
	        return promise;
	    }
	    /**
	     * {@link LyraEncoder} のインスタンスを生成する
	     *
	     * 生成したインスタンスが不要になったら {@link LyraEncoder.destroy} メソッドを呼び出してリソースを解放すること
	     *
	     * なお、同じオプションで複数回 {@link createEncoder} メソッドが呼び出された場合には、
	     * 内部的には（wasm レベルでは）同じエンコーダインスタンスが共有して使い回されることになり、
	     * エンコーダ用に確保された wasm メモリ領域は、生成された全ての {@link LyraEncoder} が
	     * {@link LyraEncoder.destroy} を呼び出すまでは解放されない
	     *
	     * @params options エンコーダに指定するオプション
	     * @returns 生成された {@link LyraEncoder} インスタンス
	     */
	    createEncoder(options = {}) {
	        const channel = new MessageChannel();
	        const promise = new Promise((resolve, reject) => {
	            channel.port1.addEventListener("message", (res) => {
	                const result = res.data.result;
	                if ("error" in result) {
	                    reject(result.error);
	                }
	                else {
	                    resolve(new LyraEncoder(channel.port1, result.frameSize, options));
	                }
	            }, { once: true });
	            channel.port1.start();
	        });
	        this.worker.postMessage({ type: "LyraModule.createEncoder", port: channel.port2, options }, [channel.port2]);
	        return promise;
	    }
	    /**
	     * {@link LyraDecoder} のインスタンスを生成する
	     *
	     * 生成したインスタンスが不要になったら {@link LyraDecoder.destroy} メソッドを呼び出してリソースを解放すること
	     *
	     * なお、同じオプションで複数回 {@link createDecoder} メソッドが呼び出された場合には、
	     * 内部的には（wasm レベルでは）同じデコーダインスタンスが共有して使い回されることになり、
	     * エンコーダ用に確保された wasm メモリ領域は、生成された全ての {@link LyraDecoder} が
	     * {@link LyraDecoder.destroy} を呼び出すまでは解放されない
	     *
	     * @params options デコーダに指定するオプション
	     * @returns 生成された {@link LyraDecoder} インスタンス
	     */
	    createDecoder(options = {}) {
	        const channel = new MessageChannel();
	        const promise = new Promise((resolve, reject) => {
	            channel.port1.addEventListener("message", (res) => {
	                const result = res.data.result;
	                if ("error" in result) {
	                    reject(result.error);
	                }
	                else {
	                    resolve(new LyraDecoder(channel.port1, result.frameSize, options));
	                }
	            }, { once: true });
	            channel.port1.start();
	        });
	        this.worker.postMessage({ type: "LyraModule.createDecoder", port: channel.port2, options }, [channel.port2]);
	        return promise;
	    }
	}
	/**
	 * Lyra のエンコーダ
	 */
	class LyraEncoder {
	    /**
	     * wasm でのエンコード処理を実行する web worker と通信するためのポート
	     */
	    port;
	    /**
	     * 現在のサンププリングレート
	     */
	    sampleRate;
	    /**
	     * 現在のチャネル数
	     */
	    numberOfChannels;
	    /**
	     * 現在のエンコードビットレート
	     */
	    bitrate;
	    /**
	     * DTX が有効になっているかどうか
	     */
	    enableDtx;
	    /**
	     * 一つのフレーム（{@link LyraEncoder.encode} メソッドに渡す音声データ）に含めるサンプル数
	     */
	    frameSize;
	    /**
	     * @internal
	     */
	    constructor(port, frameSize, options) {
	        this.port = port;
	        this.frameSize = frameSize;
	        this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
	        this.numberOfChannels = options.numberOfChannels || DEFAULT_CHANNELS;
	        this.bitrate = options.bitrate || DEFAULT_BITRATE;
	        this.enableDtx = options.enableDtx || DEFAULT_ENABLE_DTX;
	    }
	    /**
	     * 20ms 分の音声データをエンコードする
	     *
	     * なお audioData の所有権は web worker に移転されるので、
	     * このメソッド呼び出し後には呼び出しもとスレッドからはデータに参照できなくなります
	     * （つまり同じ audioData インスタンスの使い回しはできない）
	     *
	     * @params audioData エンコード対象の音声データ
	     * @returns エンコード後のバイト列。もし DTX が有効で音声データが無音な場合には undefined が代わりに返される。
	     *
	     * @throws
	     *
	     * 以下のいずれかに該当する場合には例外が送出される:
	     * - 入力音声データが 20ms 単位（サンプル数としては {@link LyraEncoder.frameSize}）ではない
	     * - その他、何らかの理由でエンコードに失敗した場合
	     */
	    encode(audioData) {
	        const promise = new Promise((resolve, reject) => {
	            this.port.addEventListener("message", (res) => {
	                const result = res.data.result;
	                if ("error" in result) {
	                    reject(result.error);
	                }
	                else {
	                    resolve(result.encodedAudioData);
	                }
	            }, { once: true });
	        });
	        this.port.postMessage({ type: "LyraEncoder.encode", audioData }, [audioData.buffer]);
	        return promise;
	    }
	    /**
	     * エンコーダ用に確保したリソースを解放する
	     */
	    destroy() {
	        this.port.postMessage({ type: "LyraEncoder.destroy" });
	        this.port.close();
	    }
	    /**
	     * {@link LyraEncoderState} から {@link LyraEncoder} を復元する
	     *
	     * {@link LyraEncoder} は {@link MessagePort.postMessage()} を使って、
	     * 別の web worker に転送することが可能。
	     * ただし、転送時にはクラスやメソッドの状態は落ちてしまうので、
	     * それを復元して再び利用可能にするための関数。
	     * なお、転送の際には {@link LyraEncoder.port} の所有権を移譲する必要がある。
	     *
	     * @param state エンコーダの状態
	     * @return 復元されたエンコーダ
	     */
	    static fromState(state) {
	        state.port.start();
	        return new LyraEncoder(state.port, state.frameSize, state);
	    }
	}
	/**
	 * Lyra のデコーダ
	 */
	class LyraDecoder {
	    /**
	     * wasm でのデコード処理を実行する web worker と通信するためのポート
	     */
	    port;
	    /**
	     * 現在のサンププリングレート
	     */
	    sampleRate;
	    /**
	     * 現在のチャネル数
	     */
	    numberOfChannels;
	    /**
	     * 一つのフレーム（{@link LyraEncoder.decode} メソッドの返り値の音声データ）に含まれるサンプル数
	     */
	    frameSize;
	    /**
	     * @internal
	     */
	    constructor(port, frameSize, options) {
	        this.port = port;
	        this.frameSize = frameSize;
	        this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
	        this.numberOfChannels = options.numberOfChannels || DEFAULT_CHANNELS;
	    }
	    /**
	     * {@link LyraEncoder.encode} メソッドによってエンコードされた音声データをデコードする
	     *
	     * なお encodedAudioData の所有権は web worker に移転されるので、
	     * このメソッド呼び出し後には呼び出しもとスレッドからはデータに参照できなくなります
	     * （つまり同じ encodedAudioData インスタンスの使い回しはできない）
	     *
	     * @params encodedAudioData デコード対象のバイナリ列ないし undefined
	     * @returns デコードされた 20ms 分の音声データ。undefined が渡された場合には代わりにコンフォートノイズが生成される。
	     */
	    decode(encodedAudioData) {
	        const promise = new Promise((resolve, reject) => {
	            this.port.addEventListener("message", (res) => {
	                const result = res.data.result;
	                if ("error" in result) {
	                    reject(result.error);
	                }
	                else {
	                    resolve(result.audioData);
	                }
	            }, { once: true });
	        });
	        if (encodedAudioData === undefined) {
	            this.port.postMessage({ type: "LyraDecoder.decode", encodedAudioData });
	        }
	        else {
	            this.port.postMessage({ type: "LyraDecoder.decode", encodedAudioData }, [encodedAudioData.buffer]);
	        }
	        return promise;
	    }
	    /**
	     * デコーダ用に確保したリソースを解放する
	     */
	    destroy() {
	        this.port.postMessage({ type: "LyraDecoder.destroy" });
	        this.port.close();
	    }
	    /**
	     * {@link LyraDecoderState} から {@link LyraDecoder} を復元する
	     *
	     * {@link LyraDecoder} は {@link MessagePort.postMessage()} を使って、
	     * 別の web worker に転送することが可能。
	     * ただし、転送時にはクラスやメソッドの状態は落ちてしまうので、
	     * それを復元して再び利用可能にするための関数。
	     * なお、転送の際には {@link LyraDecoder.port} の所有権を移譲する必要がある。
	     *
	     * @param state デコーダの状態
	     * @return 復元されたデコーダ
	     */
	    static fromState(state) {
	        state.port.start();
	        return new LyraDecoder(state.port, state.frameSize, state);
	    }
	}

	/**
	 * ビルド時に lyra_worker.ts のビルド結果（の base64 ）で置換される文字列
	 */
	const LYRA_WORKER_SCRIPT = 'KGZ1bmN0aW9uIChmYWN0b3J5KSB7CiAgICB0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoZmFjdG9yeSkgOgogICAgZmFjdG9yeSgpOwp9KSgoZnVuY3Rpb24gKCkgeyAndXNlIHN0cmljdCc7CgogICAgLyoqCiAgICAgKiBAc2hpZ3VyZWRvL2x5cmEtd2FzbQogICAgICogTHlyYSBWMiBXZWJBc3NlbWJseSBidWlsZAogICAgICogQHZlcnNpb246IDIwMjIuMi4wCiAgICAgKiBAYXV0aG9yOiBTaGlndXJlZG8gSW5jLgogICAgICogQGxpY2Vuc2U6IEFwYWNoZS0yLjAKICAgICAqKi8KCiAgICBjb25zdCBERUZBVUxUX1NBTVBMRV9SQVRFID0gMTYwMDA7CiAgICBjb25zdCBERUZBVUxUX0JJVFJBVEUgPSA5MjAwOwogICAgY29uc3QgREVGQVVMVF9FTkFCTEVfRFRYID0gZmFsc2U7CiAgICBjb25zdCBERUZBVUxUX0NIQU5ORUxTID0gMTsKICAgIC8qKgogICAgICogTHlyYSDjga7jgqjjg7PjgrPjg7zjg4AKICAgICAqLwogICAgY2xhc3MgTHlyYUVuY29kZXIgewogICAgICAgIC8qKgogICAgICAgICAqIHdhc20g44Gn44Gu44Ko44Oz44Kz44O844OJ5Yem55CG44KS5a6f6KGM44GZ44KLIHdlYiB3b3JrZXIg44Go6YCa5L+h44GZ44KL44Gf44KB44Gu44Od44O844OICiAgICAgICAgICovCiAgICAgICAgcG9ydDsKICAgICAgICAvKioKICAgICAgICAgKiDnj77lnKjjga7jgrXjg7Pjg5fjg5fjg6rjg7PjgrDjg6zjg7zjg4gKICAgICAgICAgKi8KICAgICAgICBzYW1wbGVSYXRlOwogICAgICAgIC8qKgogICAgICAgICAqIOePvuWcqOOBruODgeODo+ODjeODq+aVsAogICAgICAgICAqLwogICAgICAgIG51bWJlck9mQ2hhbm5lbHM7CiAgICAgICAgLyoqCiAgICAgICAgICog54++5Zyo44Gu44Ko44Oz44Kz44O844OJ44OT44OD44OI44Os44O844OICiAgICAgICAgICovCiAgICAgICAgYml0cmF0ZTsKICAgICAgICAvKioKICAgICAgICAgKiBEVFgg44GM5pyJ5Yq544Gr44Gq44Gj44Gm44GE44KL44GL44Gp44GG44GLCiAgICAgICAgICovCiAgICAgICAgZW5hYmxlRHR4OwogICAgICAgIC8qKgogICAgICAgICAqIOS4gOOBpOOBruODleODrOODvOODoO+8iHtAbGluayBMeXJhRW5jb2Rlci5lbmNvZGV9IOODoeOCveODg+ODieOBq+a4oeOBmemfs+WjsOODh+ODvOOCv++8ieOBq+WQq+OCgeOCi+OCteODs+ODl+ODq+aVsAogICAgICAgICAqLwogICAgICAgIGZyYW1lU2l6ZTsKICAgICAgICAvKioKICAgICAgICAgKiBAaW50ZXJuYWwKICAgICAgICAgKi8KICAgICAgICBjb25zdHJ1Y3Rvcihwb3J0LCBmcmFtZVNpemUsIG9wdGlvbnMpIHsKICAgICAgICAgICAgdGhpcy5wb3J0ID0gcG9ydDsKICAgICAgICAgICAgdGhpcy5mcmFtZVNpemUgPSBmcmFtZVNpemU7CiAgICAgICAgICAgIHRoaXMuc2FtcGxlUmF0ZSA9IG9wdGlvbnMuc2FtcGxlUmF0ZSB8fCBERUZBVUxUX1NBTVBMRV9SQVRFOwogICAgICAgICAgICB0aGlzLm51bWJlck9mQ2hhbm5lbHMgPSBvcHRpb25zLm51bWJlck9mQ2hhbm5lbHMgfHwgREVGQVVMVF9DSEFOTkVMUzsKICAgICAgICAgICAgdGhpcy5iaXRyYXRlID0gb3B0aW9ucy5iaXRyYXRlIHx8IERFRkFVTFRfQklUUkFURTsKICAgICAgICAgICAgdGhpcy5lbmFibGVEdHggPSBvcHRpb25zLmVuYWJsZUR0eCB8fCBERUZBVUxUX0VOQUJMRV9EVFg7CiAgICAgICAgfQogICAgICAgIC8qKgogICAgICAgICAqIDIwbXMg5YiG44Gu6Z+z5aOw44OH44O844K/44KS44Ko44Oz44Kz44O844OJ44GZ44KLCiAgICAgICAgICoKICAgICAgICAgKiDjgarjgYogYXVkaW9EYXRhIOOBruaJgOacieaoqeOBryB3ZWIgd29ya2VyIOOBq+enu+i7ouOBleOCjOOCi+OBruOBp+OAgQogICAgICAgICAqIOOBk+OBruODoeOCveODg+ODieWRvOOBs+WHuuOBl+W+jOOBq+OBr+WRvOOBs+WHuuOBl+OCguOBqOOCueODrOODg+ODieOBi+OCieOBr+ODh+ODvOOCv+OBq+WPgueFp+OBp+OBjeOBquOBj+OBquOCiuOBvuOBmQogICAgICAgICAqIO+8iOOBpOOBvuOCiuWQjOOBmCBhdWRpb0RhdGEg44Kk44Oz44K544K/44Oz44K544Gu5L2/44GE5Zue44GX44Gv44Gn44GN44Gq44GE77yJCiAgICAgICAgICoKICAgICAgICAgKiBAcGFyYW1zIGF1ZGlvRGF0YSDjgqjjg7PjgrPjg7zjg4nlr77osaHjga7pn7Plo7Djg4fjg7zjgr8KICAgICAgICAgKiBAcmV0dXJucyDjgqjjg7PjgrPjg7zjg4nlvozjga7jg5DjgqTjg4jliJfjgILjgoLjgZcgRFRYIOOBjOacieWKueOBp+mfs+WjsOODh+ODvOOCv+OBjOeEoemfs+OBquWgtOWQiOOBq+OBryB1bmRlZmluZWQg44GM5Luj44KP44KK44Gr6L+U44GV44KM44KL44CCCiAgICAgICAgICoKICAgICAgICAgKiBAdGhyb3dzCiAgICAgICAgICoKICAgICAgICAgKiDku6XkuIvjga7jgYTjgZrjgozjgYvjgavoqbLlvZPjgZnjgovloLTlkIjjgavjga/kvovlpJbjgYzpgIHlh7rjgZXjgozjgos6CiAgICAgICAgICogLSDlhaXlipvpn7Plo7Djg4fjg7zjgr/jgYwgMjBtcyDljZjkvY3vvIjjgrXjg7Pjg5fjg6vmlbDjgajjgZfjgabjga8ge0BsaW5rIEx5cmFFbmNvZGVyLmZyYW1lU2l6ZX3vvInjgafjga/jgarjgYQKICAgICAgICAgKiAtIOOBneOBruS7luOAgeS9leOCieOBi+OBrueQhueUseOBp+OCqOODs+OCs+ODvOODieOBq+WkseaVl+OBl+OBn+WgtOWQiAogICAgICAgICAqLwogICAgICAgIGVuY29kZShhdWRpb0RhdGEpIHsKICAgICAgICAgICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHsKICAgICAgICAgICAgICAgIHRoaXMucG9ydC5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIiwgKHJlcykgPT4gewogICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHJlcy5kYXRhLnJlc3VsdDsKICAgICAgICAgICAgICAgICAgICBpZiAoImVycm9yIiBpbiByZXN1bHQpIHsKICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KHJlc3VsdC5lcnJvcik7CiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICAgIGVsc2UgewogICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdC5lbmNvZGVkQXVkaW9EYXRhKTsKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSk7CiAgICAgICAgICAgIH0pOwogICAgICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2UoeyB0eXBlOiAiTHlyYUVuY29kZXIuZW5jb2RlIiwgYXVkaW9EYXRhIH0sIFthdWRpb0RhdGEuYnVmZmVyXSk7CiAgICAgICAgICAgIHJldHVybiBwcm9taXNlOwogICAgICAgIH0KICAgICAgICAvKioKICAgICAgICAgKiDjgqjjg7PjgrPjg7zjg4DnlKjjgavnorrkv53jgZfjgZ/jg6rjgr3jg7zjgrnjgpLop6PmlL7jgZnjgosKICAgICAgICAgKi8KICAgICAgICBkZXN0cm95KCkgewogICAgICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2UoeyB0eXBlOiAiTHlyYUVuY29kZXIuZGVzdHJveSIgfSk7CiAgICAgICAgICAgIHRoaXMucG9ydC5jbG9zZSgpOwogICAgICAgIH0KICAgICAgICAvKioKICAgICAgICAgKiB7QGxpbmsgTHlyYUVuY29kZXJTdGF0ZX0g44GL44KJIHtAbGluayBMeXJhRW5jb2Rlcn0g44KS5b6p5YWD44GZ44KLCiAgICAgICAgICoKICAgICAgICAgKiB7QGxpbmsgTHlyYUVuY29kZXJ9IOOBryB7QGxpbmsgTWVzc2FnZVBvcnQucG9zdE1lc3NhZ2UoKX0g44KS5L2/44Gj44Gm44CBCiAgICAgICAgICog5Yil44GuIHdlYiB3b3JrZXIg44Gr6Lui6YCB44GZ44KL44GT44Go44GM5Y+v6IO944CCCiAgICAgICAgICog44Gf44Gg44GX44CB6Lui6YCB5pmC44Gr44Gv44Kv44Op44K544KE44Oh44K944OD44OJ44Gu54q25oWL44Gv6JC944Gh44Gm44GX44G+44GG44Gu44Gn44CBCiAgICAgICAgICog44Gd44KM44KS5b6p5YWD44GX44Gm5YaN44Gz5Yip55So5Y+v6IO944Gr44GZ44KL44Gf44KB44Gu6Zai5pWw44CCCiAgICAgICAgICog44Gq44GK44CB6Lui6YCB44Gu6Zqb44Gr44GvIHtAbGluayBMeXJhRW5jb2Rlci5wb3J0fSDjga7miYDmnInmqKnjgpLnp7vorbLjgZnjgovlv4XopoHjgYzjgYLjgovjgIIKICAgICAgICAgKgogICAgICAgICAqIEBwYXJhbSBzdGF0ZSDjgqjjg7PjgrPjg7zjg4Djga7nirbmhYsKICAgICAgICAgKiBAcmV0dXJuIOW+qeWFg+OBleOCjOOBn+OCqOODs+OCs+ODvOODgAogICAgICAgICAqLwogICAgICAgIHN0YXRpYyBmcm9tU3RhdGUoc3RhdGUpIHsKICAgICAgICAgICAgc3RhdGUucG9ydC5zdGFydCgpOwogICAgICAgICAgICByZXR1cm4gbmV3IEx5cmFFbmNvZGVyKHN0YXRlLnBvcnQsIHN0YXRlLmZyYW1lU2l6ZSwgc3RhdGUpOwogICAgICAgIH0KICAgIH0KICAgIC8qKgogICAgICogTHlyYSDjga7jg4fjgrPjg7zjg4AKICAgICAqLwogICAgY2xhc3MgTHlyYURlY29kZXIgewogICAgICAgIC8qKgogICAgICAgICAqIHdhc20g44Gn44Gu44OH44Kz44O844OJ5Yem55CG44KS5a6f6KGM44GZ44KLIHdlYiB3b3JrZXIg44Go6YCa5L+h44GZ44KL44Gf44KB44Gu44Od44O844OICiAgICAgICAgICovCiAgICAgICAgcG9ydDsKICAgICAgICAvKioKICAgICAgICAgKiDnj77lnKjjga7jgrXjg7Pjg5fjg5fjg6rjg7PjgrDjg6zjg7zjg4gKICAgICAgICAgKi8KICAgICAgICBzYW1wbGVSYXRlOwogICAgICAgIC8qKgogICAgICAgICAqIOePvuWcqOOBruODgeODo+ODjeODq+aVsAogICAgICAgICAqLwogICAgICAgIG51bWJlck9mQ2hhbm5lbHM7CiAgICAgICAgLyoqCiAgICAgICAgICog5LiA44Gk44Gu44OV44Os44O844Og77yIe0BsaW5rIEx5cmFFbmNvZGVyLmRlY29kZX0g44Oh44K944OD44OJ44Gu6L+U44KK5YCk44Gu6Z+z5aOw44OH44O844K/77yJ44Gr5ZCr44G+44KM44KL44K144Oz44OX44Or5pWwCiAgICAgICAgICovCiAgICAgICAgZnJhbWVTaXplOwogICAgICAgIC8qKgogICAgICAgICAqIEBpbnRlcm5hbAogICAgICAgICAqLwogICAgICAgIGNvbnN0cnVjdG9yKHBvcnQsIGZyYW1lU2l6ZSwgb3B0aW9ucykgewogICAgICAgICAgICB0aGlzLnBvcnQgPSBwb3J0OwogICAgICAgICAgICB0aGlzLmZyYW1lU2l6ZSA9IGZyYW1lU2l6ZTsKICAgICAgICAgICAgdGhpcy5zYW1wbGVSYXRlID0gb3B0aW9ucy5zYW1wbGVSYXRlIHx8IERFRkFVTFRfU0FNUExFX1JBVEU7CiAgICAgICAgICAgIHRoaXMubnVtYmVyT2ZDaGFubmVscyA9IG9wdGlvbnMubnVtYmVyT2ZDaGFubmVscyB8fCBERUZBVUxUX0NIQU5ORUxTOwogICAgICAgIH0KICAgICAgICAvKioKICAgICAgICAgKiB7QGxpbmsgTHlyYUVuY29kZXIuZW5jb2RlfSDjg6Hjgr3jg4Pjg4njgavjgojjgaPjgabjgqjjg7PjgrPjg7zjg4njgZXjgozjgZ/pn7Plo7Djg4fjg7zjgr/jgpLjg4fjgrPjg7zjg4njgZnjgosKICAgICAgICAgKgogICAgICAgICAqIOOBquOBiiBlbmNvZGVkQXVkaW9EYXRhIOOBruaJgOacieaoqeOBryB3ZWIgd29ya2VyIOOBq+enu+i7ouOBleOCjOOCi+OBruOBp+OAgQogICAgICAgICAqIOOBk+OBruODoeOCveODg+ODieWRvOOBs+WHuuOBl+W+jOOBq+OBr+WRvOOBs+WHuuOBl+OCguOBqOOCueODrOODg+ODieOBi+OCieOBr+ODh+ODvOOCv+OBq+WPgueFp+OBp+OBjeOBquOBj+OBquOCiuOBvuOBmQogICAgICAgICAqIO+8iOOBpOOBvuOCiuWQjOOBmCBlbmNvZGVkQXVkaW9EYXRhIOOCpOODs+OCueOCv+ODs+OCueOBruS9v+OBhOWbnuOBl+OBr+OBp+OBjeOBquOBhO+8iQogICAgICAgICAqCiAgICAgICAgICogQHBhcmFtcyBlbmNvZGVkQXVkaW9EYXRhIOODh+OCs+ODvOODieWvvuixoeOBruODkOOCpOODiuODquWIl+OBquOBhOOBlyB1bmRlZmluZWQKICAgICAgICAgKiBAcmV0dXJucyDjg4fjgrPjg7zjg4njgZXjgozjgZ8gMjBtcyDliIbjga7pn7Plo7Djg4fjg7zjgr/jgIJ1bmRlZmluZWQg44GM5rih44GV44KM44Gf5aC05ZCI44Gr44Gv5Luj44KP44KK44Gr44Kz44Oz44OV44Kp44O844OI44OO44Kk44K644GM55Sf5oiQ44GV44KM44KL44CCCiAgICAgICAgICovCiAgICAgICAgZGVjb2RlKGVuY29kZWRBdWRpb0RhdGEpIHsKICAgICAgICAgICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHsKICAgICAgICAgICAgICAgIHRoaXMucG9ydC5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIiwgKHJlcykgPT4gewogICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHJlcy5kYXRhLnJlc3VsdDsKICAgICAgICAgICAgICAgICAgICBpZiAoImVycm9yIiBpbiByZXN1bHQpIHsKICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KHJlc3VsdC5lcnJvcik7CiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICAgIGVsc2UgewogICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdC5hdWRpb0RhdGEpOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIH0sIHsgb25jZTogdHJ1ZSB9KTsKICAgICAgICAgICAgfSk7CiAgICAgICAgICAgIGlmIChlbmNvZGVkQXVkaW9EYXRhID09PSB1bmRlZmluZWQpIHsKICAgICAgICAgICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7IHR5cGU6ICJMeXJhRGVjb2Rlci5kZWNvZGUiLCBlbmNvZGVkQXVkaW9EYXRhIH0pOwogICAgICAgICAgICB9CiAgICAgICAgICAgIGVsc2UgewogICAgICAgICAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHsgdHlwZTogIkx5cmFEZWNvZGVyLmRlY29kZSIsIGVuY29kZWRBdWRpb0RhdGEgfSwgW2VuY29kZWRBdWRpb0RhdGEuYnVmZmVyXSk7CiAgICAgICAgICAgIH0KICAgICAgICAgICAgcmV0dXJuIHByb21pc2U7CiAgICAgICAgfQogICAgICAgIC8qKgogICAgICAgICAqIOODh+OCs+ODvOODgOeUqOOBq+eiuuS/neOBl+OBn+ODquOCveODvOOCueOCkuino+aUvuOBmeOCiwogICAgICAgICAqLwogICAgICAgIGRlc3Ryb3koKSB7CiAgICAgICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7IHR5cGU6ICJMeXJhRGVjb2Rlci5kZXN0cm95IiB9KTsKICAgICAgICAgICAgdGhpcy5wb3J0LmNsb3NlKCk7CiAgICAgICAgfQogICAgICAgIC8qKgogICAgICAgICAqIHtAbGluayBMeXJhRGVjb2RlclN0YXRlfSDjgYvjgokge0BsaW5rIEx5cmFEZWNvZGVyfSDjgpLlvqnlhYPjgZnjgosKICAgICAgICAgKgogICAgICAgICAqIHtAbGluayBMeXJhRGVjb2Rlcn0g44GvIHtAbGluayBNZXNzYWdlUG9ydC5wb3N0TWVzc2FnZSgpfSDjgpLkvb/jgaPjgabjgIEKICAgICAgICAgKiDliKXjga4gd2ViIHdvcmtlciDjgavou6LpgIHjgZnjgovjgZPjgajjgYzlj6/og73jgIIKICAgICAgICAgKiDjgZ/jgaDjgZfjgIHou6LpgIHmmYLjgavjga/jgq/jg6njgrnjgoTjg6Hjgr3jg4Pjg4njga7nirbmhYvjga/okL3jgaHjgabjgZfjgb7jgYbjga7jgafjgIEKICAgICAgICAgKiDjgZ3jgozjgpLlvqnlhYPjgZfjgablho3jgbPliKnnlKjlj6/og73jgavjgZnjgovjgZ/jgoHjga7plqLmlbDjgIIKICAgICAgICAgKiDjgarjgYrjgIHou6LpgIHjga7pmpvjgavjga8ge0BsaW5rIEx5cmFEZWNvZGVyLnBvcnR9IOOBruaJgOacieaoqeOCkuenu+itsuOBmeOCi+W/heimgeOBjOOBguOCi+OAggogICAgICAgICAqCiAgICAgICAgICogQHBhcmFtIHN0YXRlIOODh+OCs+ODvOODgOOBrueKtuaFiwogICAgICAgICAqIEByZXR1cm4g5b6p5YWD44GV44KM44Gf44OH44Kz44O844OACiAgICAgICAgICovCiAgICAgICAgc3RhdGljIGZyb21TdGF0ZShzdGF0ZSkgewogICAgICAgICAgICBzdGF0ZS5wb3J0LnN0YXJ0KCk7CiAgICAgICAgICAgIHJldHVybiBuZXcgTHlyYURlY29kZXIoc3RhdGUucG9ydCwgc3RhdGUuZnJhbWVTaXplLCBzdGF0ZSk7CiAgICAgICAgfQogICAgfQoKICAgIC8qKgogICAgICogUENN77yITDE277yJ44Gu6Z+z5aOw44OH44O844K/44KSIEx5cmEg44Gn44Ko44Oz44Kz44O844OJ44GZ44KLCiAgICAgKgogICAgICogQHBhcmFtIGVuY29kZXIgTHlyYSDjgqjjg7PjgrPjg7zjg4AKICAgICAqIEBwYXJhbSBlbmNvZGVkRnJhbWUgUENNIOmfs+WjsOODh+ODvOOCvwogICAgICogQHBhcmFtIGNvbnRyb2xsZXIg6Z+z5aOw44OH44O844K/44Gu5Ye65Yqb44Kt44Ol44O8CiAgICAgKi8KICAgIGFzeW5jIGZ1bmN0aW9uIHRyYW5zZm9ybVBjbVRvTHlyYShlbmNvZGVyLCBlbmNvZGVkRnJhbWUsIGNvbnRyb2xsZXIpIHsKICAgICAgICBjb25zdCB2aWV3ID0gbmV3IERhdGFWaWV3KGVuY29kZWRGcmFtZS5kYXRhKTsKICAgICAgICBjb25zdCByYXdEYXRhID0gbmV3IEludDE2QXJyYXkoZW5jb2RlZEZyYW1lLmRhdGEuYnl0ZUxlbmd0aCAvIDIpOwogICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZW5jb2RlZEZyYW1lLmRhdGEuYnl0ZUxlbmd0aDsgaSArPSAyKSB7CiAgICAgICAgICAgIHJhd0RhdGFbaSAvIDJdID0gdmlldy5nZXRJbnQxNihpLCBmYWxzZSk7CiAgICAgICAgfQogICAgICAgIGNvbnN0IGVuY29kZWQgPSBhd2FpdCBlbmNvZGVyLmVuY29kZShyYXdEYXRhKTsKICAgICAgICBpZiAoZW5jb2RlZCA9PT0gdW5kZWZpbmVkKSB7CiAgICAgICAgICAgIC8vIERUWCDjgYzmnInlirnjgIHjgYvjgaTjgIEgZW5jb2RlZEZyYW1lIOOBjOeEoemfs++8iOOBquOBhOOBl+ODjuOCpOOCuuOBruOBv+OCkuWQq+OCk+OBp+OBhOOCi++8ieWgtOWQiOOBq+OBr+OBk+OBk+OBq+adpeOCiwogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIGVuY29kZWRGcmFtZS5kYXRhID0gZW5jb2RlZC5idWZmZXI7CiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGVuY29kZWRGcmFtZSk7CiAgICB9CiAgICAvKioKICAgICAqIEx5cmEg44Gn44Ko44Oz44Kz44O844OJ44GV44KM44Gf6Z+z5aOw44OH44O844K/44KS44OH44Kz44O844OJ44GX44GmIFBDTe+8iEwxNu+8ieOBq+WkieaPm+OBmeOCiwogICAgICoKICAgICAqIEBwYXJhbSBkZWNvZGVyIEx5cmEg44OH44Kz44O844OACiAgICAgKiBAcGFyYW0gZW5jb2RlZEZyYW1lIEx5cmEg44Gn44Ko44Oz44Kz44O844OJ44GV44KM44Gf6Z+z5aOw44OH44O844K/CiAgICAgKiBAcGFyYW0gY29udHJvbGxlciDpn7Plo7Djg4fjg7zjgr/jga7lh7rlipvjgq3jg6Xjg7wKICAgICAqLwogICAgYXN5bmMgZnVuY3Rpb24gdHJhbnNmb3JtTHlyYVRvUGNtKGRlY29kZXIsIGVuY29kZWRGcmFtZSwgY29udHJvbGxlcikgewogICAgICAgIGlmIChlbmNvZGVkRnJhbWUuZGF0YS5ieXRlTGVuZ3RoID09PSAzKSB7CiAgICAgICAgICAgIC8vIGUyZWUg44KS5pyJ5Yq544Gr44GX44Gf5aC05ZCI44Gr44Gv44CBZTJlZSDjg6Ljgrjjg6Xjg7zjg6vjgYzkuI3mmI7jgarjg5HjgrHjg4Pjg4jjgpLlj5fkv6HjgZfjgZ/loLTlkIjjgasKICAgICAgICAgICAgLy8gb3B1cyDjga7nhKHpn7Pjg5HjgrHjg4Pjg4jjgpLnlJ/miJDjgZnjgovjga7jgafjgZ3jgozjgpLnhKHoppbjgZnjgovjgIIKICAgICAgICAgICAgLy8g44Gq44GK44CBc2VuZHJlY3Ygb3Igc2VuZG9ubHkg44Gn5o6l57aa55u05b6M44Gr55Sf5oiQ44GV44KM44Gf44OR44Kx44OD44OI44KS5Y+X5L+h44GZ44KL44Go5bi444Gr44GT44GT44Gr44GP44KL5qih5qeY44CCCiAgICAgICAgICAgIC8vCiAgICAgICAgICAgIC8vIEx5cmEg44Gn44Gv5Zyn57iu5b6M44Gu6Z+z5aOw44OH44O844K/44K144Kk44K644GM5Zu65a6a6Kq/44Gn44CBMyDjg5DjgqTjg4jjgajjgarjgovjgZPjgajjga/jgarjgYTjga7jgafjgIEKICAgICAgICAgICAgLy8g44GT44Gu5p2h5Lu244Gn5q2j5bi444GqIEx5cmEg44OR44Kx44OD44OI44GM5o2o44Gm44KJ44KM44KL44GT44Go44Gv44Gq44GE44CCCiAgICAgICAgICAgIC8vCiAgICAgICAgICAgIC8vIEZJWE1FKHNpemUpOiBlMmVlIOWBtOOBi+OCiSBvcHVzIOOCkuS7ruWumuOBl+OBn+eEoemfs+eUn+aIkOOCs+ODvOODieOBjOOBquOBj+OBquOBo+OBn+OCieOBk+OBruODr+ODvOOCr+OCouODqeOCpuODs+ODieOCgumZpOWOu+OBmeOCiwogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIGNvbnN0IGRlY29kZWQgPSBhd2FpdCBkZWNvZGVyLmRlY29kZShuZXcgVWludDhBcnJheShlbmNvZGVkRnJhbWUuZGF0YSkpOwogICAgICAgIGNvbnN0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihkZWNvZGVkLmxlbmd0aCAqIDIpOwogICAgICAgIGNvbnN0IHZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyKTsKICAgICAgICBmb3IgKGNvbnN0IFtpLCB2XSBvZiBkZWNvZGVkLmVudHJpZXMoKSkgewogICAgICAgICAgICB2aWV3LnNldEludDE2KGkgKiAyLCB2LCBmYWxzZSk7CiAgICAgICAgfQogICAgICAgIGVuY29kZWRGcmFtZS5kYXRhID0gYnVmZmVyOwogICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShlbmNvZGVkRnJhbWUpOwogICAgfQoKICAgIGZ1bmN0aW9uIGNyZWF0ZVNlbmRlclRyYW5zZm9ybShlbmNvZGVyU3RhdGUpIHsKICAgICAgICBjb25zdCBlbmNvZGVyID0gTHlyYUVuY29kZXIuZnJvbVN0YXRlKGVuY29kZXJTdGF0ZSk7CiAgICAgICAgcmV0dXJuIG5ldyBUcmFuc2Zvcm1TdHJlYW0oewogICAgICAgICAgICBhc3luYyB0cmFuc2Zvcm0oZW5jb2RlZEZyYW1lLCBjb250cm9sbGVyKSB7CiAgICAgICAgICAgICAgICBhd2FpdCB0cmFuc2Zvcm1QY21Ub0x5cmEoZW5jb2RlciwgZW5jb2RlZEZyYW1lLCBjb250cm9sbGVyKTsKICAgICAgICAgICAgfSwKICAgICAgICAgICAgZmx1c2goKSB7CiAgICAgICAgICAgICAgICBlbmNvZGVyLmRlc3Ryb3koKTsKICAgICAgICAgICAgfSwKICAgICAgICB9KTsKICAgIH0KICAgIGZ1bmN0aW9uIGNyZWF0ZVJlY2VpdmVyVHJhbnNmb3JtKGRlY29kZXJTdGF0ZSkgewogICAgICAgIGNvbnN0IGRlY29kZXIgPSBMeXJhRGVjb2Rlci5mcm9tU3RhdGUoZGVjb2RlclN0YXRlKTsKICAgICAgICByZXR1cm4gbmV3IFRyYW5zZm9ybVN0cmVhbSh7CiAgICAgICAgICAgIGFzeW5jIHRyYW5zZm9ybShlbmNvZGVkRnJhbWUsIGNvbnRyb2xsZXIpIHsKICAgICAgICAgICAgICAgIGF3YWl0IHRyYW5zZm9ybUx5cmFUb1BjbShkZWNvZGVyLCBlbmNvZGVkRnJhbWUsIGNvbnRyb2xsZXIpOwogICAgICAgICAgICB9LAogICAgICAgICAgICBmbHVzaCgpIHsKICAgICAgICAgICAgICAgIGRlY29kZXIuZGVzdHJveSgpOwogICAgICAgICAgICB9LAogICAgICAgIH0pOwogICAgfQogICAgb25ydGN0cmFuc2Zvcm0gPSAobXNnKSA9PiB7CiAgICAgICAgaWYgKG1zZy50cmFuc2Zvcm1lci5vcHRpb25zLm5hbWUgPT0gJ3NlbmRlclRyYW5zZm9ybScpIHsKICAgICAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gY3JlYXRlU2VuZGVyVHJhbnNmb3JtKG1zZy50cmFuc2Zvcm1lci5vcHRpb25zLmx5cmFFbmNvZGVyKTsKICAgICAgICAgICAgbXNnLnRyYW5zZm9ybWVyLnJlYWRhYmxlCiAgICAgICAgICAgICAgICAucGlwZVRocm91Z2godHJhbnNmb3JtKQogICAgICAgICAgICAgICAgLnBpcGVUbyhtc2cudHJhbnNmb3JtZXIud3JpdGFibGUpCiAgICAgICAgICAgICAgICAuY2F0Y2goKGUpID0+IGNvbnNvbGUud2FybihlKSk7CiAgICAgICAgfQogICAgICAgIGVsc2UgaWYgKG1zZy50cmFuc2Zvcm1lci5vcHRpb25zLm5hbWUgPT0gJ3JlY2VpdmVyVHJhbnNmb3JtJykgewogICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm0gPSBjcmVhdGVSZWNlaXZlclRyYW5zZm9ybShtc2cudHJhbnNmb3JtZXIub3B0aW9ucy5seXJhRGVjb2Rlcik7CiAgICAgICAgICAgIG1zZy50cmFuc2Zvcm1lci5yZWFkYWJsZQogICAgICAgICAgICAgICAgLnBpcGVUaHJvdWdoKHRyYW5zZm9ybSkKICAgICAgICAgICAgICAgIC5waXBlVG8obXNnLnRyYW5zZm9ybWVyLndyaXRhYmxlKQogICAgICAgICAgICAgICAgLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oZSkpOwogICAgICAgIH0KICAgICAgICBlbHNlIHsKICAgICAgICAgICAgY29uc29sZS53YXJuKCd1bmtub3duIG1lc3NhZ2UnKTsKICAgICAgICAgICAgY29uc29sZS53YXJuKG1zZyk7CiAgICAgICAgfQogICAgfTsKCn0pKTsK';
	/**
	 * Lyra を使用するために必要な設定を保持するためのグローバル変数
	 *
	 * undefined の場合には Lyra が無効になっていると判断され、
	 * その状態で Lyra で音声をエンコード・デコード使用とすると実行時エラーとなる
	 */
	let LYRA_CONFIG;
	/**
	 * Lyra のエンコード・デコードに必要な WebAssembly インスタンスを保持するためのグローバル変数
	 */
	let LYRA_MODULE;
	/**
	 * Lyra の初期化を行うメソッド
	 *
	 * このメソッドの呼び出し時には設定情報の保存のみを行い、
	 * Lyra での音声エンコード・デコードに必要な WebAssembly ファイルおよびモデルファイルは、
	 * 実際に必要になったタイミングで初めてロードされます
	 *
	 * Lyra を使うためには以下の機能がブラウザで利用可能である必要があります:
	 * - クロスオリジン分離（内部で SharedArrayBuffer クラスを使用しているため）
	 * - WebRTC Encoded Transform
	 *
	 * これらの機能が利用不可の場合には、このメソッドは警告メッセージを出力した上で、
	 * 返り値として false を返します
	 *
	 * @param config Lyra の設定情報
	 * @returns Lyra の初期化に成功したかどうか
	 *
	 * @public
	 */
	function initLyra(config) {
	    if (!('createEncodedStreams' in RTCRtpSender.prototype || 'transform' in RTCRtpSender.prototype)) {
	        console.warn("This browser doesn't support WebRTC Encoded Transform feature that Lyra requires.");
	        return false;
	    }
	    if (typeof SharedArrayBuffer === 'undefined') {
	        console.warn('Lyra requires cross-origin isolation to use SharedArrayBuffer.');
	        return false;
	    }
	    LYRA_CONFIG = config;
	    LYRA_MODULE = undefined;
	    return true;
	}
	/***
	 * Lyra が初期化済みかどうか
	 *
	 * @returns Lyra が初期化済みかどうか
	 */
	function isLyraInitialized() {
	    return LYRA_CONFIG !== undefined;
	}
	/**
	 * Lyra のエンコーダを生成して返す
	 *
	 * @param options エンコーダに指定するオプション
	 * @returns Lyra エンコーダのプロミス
	 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
	 */
	async function createLyraEncoder(options = {}) {
	    return (await loadLyraModule()).createEncoder(options);
	}
	/**
	 * Lyra のデコーダを生成して返す
	 *
	 * @param options デコーダに指定するオプション
	 * @returns Lyra デコーダのプロミス
	 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
	 */
	async function createLyraDecoder(options = {}) {
	    return (await loadLyraModule()).createDecoder(options);
	}
	/**
	 * Lyra 用の WebAssembly インスタンスをロードする
	 *
	 * 既にロード済みの場合には、そのインスタンスを返す
	 *
	 * @returns LyraModule インスタンスのプロミス
	 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
	 */
	async function loadLyraModule() {
	    if (LYRA_CONFIG === undefined) {
	        throw new Error('Lyra has not been initialized. Please call `Sora.initLyra()` beforehand.');
	    }
	    if (LYRA_MODULE === undefined) {
	        LYRA_MODULE = await LyraModule.load(LYRA_CONFIG.wasmPath, LYRA_CONFIG.modelPath);
	    }
	    return LYRA_MODULE;
	}
	/**
	 * WebRTC Encoded Transform に渡される Lyra 用の web worker を生成する
	 *
	 * @returns Lyra でエンコードおよびデコードを行う web worker インスタンス
	 */
	function createLyraWorker() {
	    const lyraWorkerScript = atob(LYRA_WORKER_SCRIPT);
	    const lyraWorker = new Worker(URL.createObjectURL(new Blob([lyraWorkerScript], { type: 'application/javascript' })));
	    return lyraWorker;
	}
	/**
	 * PCM（L16）の音声データを Lyra でエンコードする
	 *
	 * @param encoder Lyra エンコーダ
	 * @param encodedFrame PCM 音声データ
	 * @param controller 音声データの出力キュー
	 */
	async function transformPcmToLyra(encoder, encodedFrame, controller) {
	    const view = new DataView(encodedFrame.data);
	    const rawData = new Int16Array(encodedFrame.data.byteLength / 2);
	    for (let i = 0; i < encodedFrame.data.byteLength; i += 2) {
	        rawData[i / 2] = view.getInt16(i, false);
	    }
	    const encoded = await encoder.encode(rawData);
	    if (encoded === undefined) {
	        // DTX が有効、かつ、 encodedFrame が無音（ないしノイズのみを含んでいる）場合にはここに来る
	        return;
	    }
	    encodedFrame.data = encoded.buffer;
	    controller.enqueue(encodedFrame);
	}
	/**
	 * Lyra でエンコードされた音声データをデコードして PCM（L16）に変換する
	 *
	 * @param decoder Lyra デコーダ
	 * @param encodedFrame Lyra でエンコードされた音声データ
	 * @param controller 音声データの出力キュー
	 */
	async function transformLyraToPcm(decoder, encodedFrame, controller) {
	    if (encodedFrame.data.byteLength === 3) {
	        // e2ee を有効にした場合には、e2ee モジュールが不明なパケットを受信した場合に
	        // opus の無音パケットを生成するのでそれを無視する。
	        // なお、sendrecv or sendonly で接続直後に生成されたパケットを受信すると常にここにくる模様。
	        //
	        // Lyra では圧縮後の音声データサイズが固定調で、3 バイトとなることはないので、
	        // この条件で正常な Lyra パケットが捨てられることはない。
	        //
	        // FIXME(size): e2ee 側から opus を仮定した無音生成コードがなくなったらこのワークアラウンドも除去する
	        return;
	    }
	    const decoded = await decoder.decode(new Uint8Array(encodedFrame.data));
	    const buffer = new ArrayBuffer(decoded.length * 2);
	    const view = new DataView(buffer);
	    for (const [i, v] of decoded.entries()) {
	        view.setInt16(i * 2, v, false);
	    }
	    encodedFrame.data = buffer;
	    controller.enqueue(encodedFrame);
	}
	/**
	 * SDP に記載される Lyra のエンコードパラメータ
	 */
	class LyraParams {
	    constructor(version, bitrate, enableDtx) {
	        if (version !== LYRA_VERSION$1) {
	            throw new Error(`Unsupported Lyra version: ${version} (supported version is ${LYRA_VERSION$1})`);
	        }
	        if (bitrate !== 3200 && bitrate !== 6000 && bitrate !== 9200) {
	            throw new Error(`Unsupported Lyra bitrate: ${bitrate} (must be one of 3200, 6000, or 9200)`);
	        }
	        this.version = version;
	        this.bitrate = bitrate;
	        this.enableDtx = enableDtx;
	    }
	    /**
	     * SDP の media description 部分をパースして Lyra のエンコードパラメータを取得する
	     *
	     * @param media SDP の media description 部分
	     * @returns パース結果
	     * @throws SDP の内容が期待通りではなくパースに失敗した場合
	     */
	    static parseMediaDescription(media) {
	        const version = /^a=fmtp:109.*[ ;]version=([0-9.]+)([;]|$)/m.exec(media);
	        if (!version) {
	            throw new Error(`Lyra parameter 'version' is not found in media description: ${media}`);
	        }
	        const bitrate = /^a=fmtp:109.*[ ;]bitrate=([0-9]+)([;]|$)/m.exec(media);
	        if (!bitrate) {
	            throw new Error(`Lyra parameter 'bitrate' is not found in media description: ${media}`);
	        }
	        const usedtx = /^a=fmtp:109.*[ ;]usedtx=([01])([;]|$)/m.exec(media);
	        if (!usedtx) {
	            throw new Error(`Lyra parameter 'usedtx' is not found in media description: ${media}`);
	        }
	        return new LyraParams(version[1], Number(bitrate[1]), usedtx[1] == '1');
	    }
	    /**
	     * このエンコードパラメータに対応する SDP の fmtp 行を生成する
	     *
	     * @returns SDP の fmtp 行
	     */
	    toFmtpString() {
	        return `a=fmtp:109 version=${this.version};bitrate=${this.bitrate};usedtx=${this.enableDtx ? 1 : 0}`;
	    }
	}
	/**
	 * 接続単位の Lyra 関連の状態を保持するためのクラス
	 */
	class LyraState {
	    constructor() {
	        this.encoderOptions = {};
	        this.midToLyraParams = new Map();
	    }
	    /**
	     * offer SDP を受け取り Lyra 対応のために必要な置換や情報の収集を行う
	     *
	     * @param sdp offer SDP
	     * @returns 処理後の SDP
	     */
	    processOfferSdp(sdp) {
	        if (!sdp.includes('109 lyra/')) {
	            // 対象外なので処理する必要はない
	            return sdp;
	        }
	        this.midToLyraParams = new Map();
	        const splited = sdp.split(/^m=/m);
	        let replacedSdp = splited[0];
	        for (let media of splited.slice(1)) {
	            const midResult = /a=mid:(.*)/.exec(media);
	            if (midResult === null) {
	                continue;
	            }
	            const mid = midResult[1];
	            if (media.startsWith('audio') && media.includes('109 lyra/')) {
	                if (media.includes('a=fmtp:109 ')) {
	                    const params = LyraParams.parseMediaDescription(media);
	                    if (media.includes('a=recvonly')) {
	                        // sora からの offer SDP で recvonly ということは client から見れば送信側なので
	                        // このパラメータをエンコード用に保存しておく
	                        this.encoderOptions.bitrate = params.bitrate;
	                        this.encoderOptions.enableDtx = params.enableDtx;
	                    }
	                    this.midToLyraParams.set(mid, params);
	                }
	                // SDP を置換する:
	                // - libwebrtc は lyra を認識しないので L16 に置き換える
	                // - ただし SDP に L16 しか含まれていないと音声なし扱いになってしまうので、それを防ぐために 110 で opus を追加する
	                media = media
	                    .replace(/SAVPF([0-9 ]*) 109/, 'SAVPF$1 109 110')
	                    .replace(/109 lyra[/]16000[/]1/, '110 opus/48000/2')
	                    .replace(/a=fmtp:109 .*/, 'a=rtpmap:109 L16/16000\r\na=ptime:20');
	            }
	            replacedSdp += 'm=' + media;
	        }
	        return replacedSdp;
	    }
	    /**
	     * setLocalDescription() に渡される answer SDP を受け取り、Lyra 対応のために必要な処理を行う
	     *
	     * @param answer SDP
	     * @returns 処理後の SDP
	     */
	    processAnswerSdpForLocal(sdp) {
	        if (!sdp.includes('a=rtpmap:110 ')) {
	            // Lyra は使われていないので書き換えは不要
	            return sdp;
	        }
	        const splited = sdp.split(/^m=/m);
	        let replacedSdp = splited[0];
	        for (let media of splited.slice(1)) {
	            if (media.startsWith('audio') && media.includes('a=rtpmap:110 ')) {
	                // opus(110) ではなく L16(109) を使うように SDP を書き換える
	                //
	                // なお libwebrtc 的にはこの置換を行わなくても内部的には L16 が採用されるが、
	                // SDP と実際の動作を一致させるためにここで SDP を置換しておく
	                media = media
	                    .replace(/SAVPF([0-9 ]*) 110/, 'SAVPF$1 109')
	                    .replace(/a=rtpmap:110 opus[/]48000[/]2/, 'a=rtpmap:109 L16/16000')
	                    .replace(/a=fmtp:110 .*/, 'a=ptime:20');
	            }
	            replacedSdp += 'm=' + media;
	        }
	        return replacedSdp;
	    }
	    /**
	     * Sora に渡される answer SDP を受け取り、Lyra 対応のために必要な処理を行う
	     *
	     * @param answer SDP
	     * @returns 処理後の SDP
	     */
	    processAnswerSdpForSora(sdp) {
	        if (!sdp.includes('a=rtpmap:109 L16/16000')) {
	            // Lyra は使われていないので書き換えは不要
	            return sdp;
	        }
	        const splited = sdp.split(/^m=/m);
	        let replacedSdp = splited[0];
	        for (let media of splited.splice(1)) {
	            const midResult = /a=mid:(.*)/.exec(media);
	            if (midResult === null) {
	                continue;
	            }
	            const mid = midResult[1];
	            if (mid && media.startsWith('audio') && media.includes('a=rtpmap:109 L16/16000')) {
	                // Sora 用に L16 を Lyra に置換する
	                const params = this.midToLyraParams.get(mid);
	                if (params === undefined) {
	                    throw new Error(`Unknown audio mid ${mid}`);
	                }
	                media = media
	                    .replace(/a=rtpmap:109 L16[/]16000/, 'a=rtpmap:109 lyra/16000/1')
	                    .replace(/a=ptime:20/, params.toFmtpString());
	            }
	            replacedSdp += 'm=' + media;
	        }
	        return replacedSdp;
	    }
	    /**
	     * Lyra のエンコーダを生成する
	     *
	     * @returns 生成されたエンコーダ
	     */
	    async createEncoder() {
	        return await createLyraEncoder(this.encoderOptions);
	    }
	    /**
	     * Lyra のデコーダを生成する
	     *
	     * @returns 生成されたデコーダ
	     */
	    async createDecoder() {
	        return await createLyraDecoder({});
	    }
	}

	// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
	// https://tools.ietf.org/html/rfc1951
	// You may also wish to take a look at the guide I made about this program:
	// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
	// Some of the following code is similar to that of UZIP.js:
	// https://github.com/photopea/UZIP.js
	// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
	// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
	// is better for memory in most engines (I *think*).

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
	    for (; i < s; ++i) {
	        if (cd[i])
	            ++l[cd[i] - 1];
	    }
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
	    var n = new (v.BYTES_PER_ELEMENT == 2 ? u16 : v.BYTES_PER_ELEMENT == 4 ? u32 : u8)(e - s);
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
	            if (e >= s) {
	                // write final block
	                w[pos >> 3] = lst;
	            }
	            pos = wfblk(w, pos + 1, dat.subarray(i, e));
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

	// jest のテスト実行時にエラーが出るので以下の import はコメントアウトし自前で定数を定義している
	// TODO(sile): 回避方法が分かったら import 方式に戻したい
	// import { LYRA_VERSION } from "@shiguredo/lyra-wasm";
	const LYRA_VERSION = '1.3.0';
	function browser() {
	    const ua = window.navigator.userAgent.toLocaleLowerCase();
	    if (ua.indexOf('edge') !== -1) {
	        return 'edge';
	    }
	    else if (ua.indexOf('chrome') !== -1 && ua.indexOf('edge') === -1) {
	        return 'chrome';
	    }
	    else if (ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1) {
	        return 'safari';
	    }
	    else if (ua.indexOf('opera') !== -1) {
	        return 'opera';
	    }
	    else if (ua.indexOf('firefox') !== -1) {
	        return 'firefox';
	    }
	    return null;
	}
	function enabledSimulcast() {
	    const REQUIRED_HEADER_EXTEMSIONS = [
	        'urn:ietf:params:rtp-hdrext:sdes:mid',
	        'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id',
	        'urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id',
	    ];
	    if (!window.RTCRtpSender) {
	        return false;
	    }
	    if (!RTCRtpSender.getCapabilities) {
	        return false;
	    }
	    const capabilities = RTCRtpSender.getCapabilities('video');
	    if (!capabilities) {
	        return false;
	    }
	    const headerExtensions = capabilities.headerExtensions.map((h) => h.uri);
	    const hasAllRequiredHeaderExtensions = REQUIRED_HEADER_EXTEMSIONS.every((h) => headerExtensions.includes(h));
	    return hasAllRequiredHeaderExtensions;
	}
	function parseDataChannelConfiguration(dataChannelConfiguration) {
	    if (typeof dataChannelConfiguration !== 'object' || dataChannelConfiguration === null) {
	        throw new Error("Failed to parse options dataChannels. Options dataChannels element must be type 'object'");
	    }
	    const configuration = dataChannelConfiguration;
	    const result = {};
	    if (typeof configuration.label === 'string') {
	        result.label = configuration.label;
	    }
	    if (typeof configuration.direction === 'string') {
	        result.direction = configuration.direction;
	    }
	    if (typeof configuration.ordered === 'boolean') {
	        result.ordered = configuration.ordered;
	    }
	    if (typeof configuration.compress === 'boolean') {
	        result.compress = configuration.compress;
	    }
	    if (typeof configuration.maxPacketLifeTime === 'number') {
	        result.max_packet_life_time = configuration.maxPacketLifeTime;
	    }
	    if (typeof configuration.maxRetransmits === 'number') {
	        result.max_retransmits = configuration.maxRetransmits;
	    }
	    if (typeof configuration.protocol === 'string') {
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
	    return browser() === 'safari';
	}
	function isFirefox() {
	    return browser() === 'firefox';
	}
	function createSignalingMessage(offerSDP, role, channelId, metadata, options, redirect) {
	    if (role !== 'sendrecv' && role !== 'sendonly' && role !== 'recvonly') {
	        throw new Error('Unknown role type');
	    }
	    if (channelId === null || channelId === undefined) {
	        throw new Error('channelId can not be null or undefined');
	    }
	    const message = {
	        type: 'connect',
	        sora_client: 'Sora JavaScript SDK 2023.1.0',
	        environment: window.navigator.userAgent,
	        role: role,
	        channel_id: channelId,
	        sdp: offerSDP,
	        audio: true,
	        video: true,
	    };
	    // role: sendrecv で multistream: false の場合は例外を発生させる
	    if (role === 'sendrecv' && options.multistream !== true) {
	        throw new Error("Failed to parse options. Options multistream must be true when connecting using 'sendrecv'");
	    }
	    if (redirect === true) {
	        message.redirect = true;
	    }
	    if (typeof options.multistream === 'boolean') {
	        message.multistream = options.multistream;
	    }
	    if (typeof options.simulcast === 'boolean') {
	        message.simulcast = options.simulcast;
	    }
	    const simalcastRids = ['r0', 'r1', 'r2'];
	    if (options.simulcastRid !== undefined && 0 <= simalcastRids.indexOf(options.simulcastRid)) {
	        message.simulcast_rid = options.simulcastRid;
	    }
	    if (typeof options.spotlight === 'boolean') {
	        message.spotlight = options.spotlight;
	    }
	    if ('spotlightNumber' in options) {
	        message.spotlight_number = options.spotlightNumber;
	    }
	    const spotlightFocusRids = ['none', 'r0', 'r1', 'r2'];
	    if (options.spotlightFocusRid !== undefined &&
	        0 <= spotlightFocusRids.indexOf(options.spotlightFocusRid)) {
	        message.spotlight_focus_rid = options.spotlightFocusRid;
	    }
	    if (options.spotlightUnfocusRid !== undefined &&
	        0 <= spotlightFocusRids.indexOf(options.spotlightUnfocusRid)) {
	        message.spotlight_unfocus_rid = options.spotlightUnfocusRid;
	    }
	    if (metadata !== undefined) {
	        message.metadata = metadata;
	    }
	    if (options.signalingNotifyMetadata !== undefined) {
	        message.signaling_notify_metadata = options.signalingNotifyMetadata;
	    }
	    if (options.forwardingFilter !== undefined) {
	        message.forwarding_filter = options.forwardingFilter;
	    }
	    if (options.clientId !== undefined) {
	        message.client_id = options.clientId;
	    }
	    if (options.bundleId !== undefined) {
	        message.bundle_id = options.bundleId;
	    }
	    if (typeof options.dataChannelSignaling === 'boolean') {
	        message.data_channel_signaling = options.dataChannelSignaling;
	    }
	    if (typeof options.ignoreDisconnectWebSocket === 'boolean') {
	        message.ignore_disconnect_websocket = options.ignoreDisconnectWebSocket;
	    }
	    // parse options
	    const audioPropertyKeys = ['audioCodecType', 'audioBitRate'];
	    const audioOpusParamsPropertyKeys = [
	        'audioOpusParamsChannels',
	        'audioOpusParamsMaxplaybackrate',
	        'audioOpusParamsStereo',
	        'audioOpusParamsSpropStereo',
	        'audioOpusParamsMinptime',
	        'audioOpusParamsPtime',
	        'audioOpusParamsUseinbandfec',
	        'audioOpusParamsUsedtx',
	    ];
	    const audioLyraParamsPropertyKeys = ['audioLyraParamsBitrate', 'audioLyraParamsUsedtx'];
	    const videoPropertyKeys = [
	        'videoCodecType',
	        'videoBitRate',
	        'videoVP9Params',
	        'videoH264Params',
	        'videoAV1Params',
	    ];
	    const copyOptions = Object.assign({}, options);
	    Object.keys(copyOptions).forEach((key) => {
	        if (key === 'audio' && typeof copyOptions[key] === 'boolean') {
	            return;
	        }
	        if (key === 'video' && typeof copyOptions[key] === 'boolean') {
	            return;
	        }
	        if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
	            return;
	        }
	        if (0 <= audioOpusParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
	            return;
	        }
	        if (0 <= audioLyraParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
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
	        if ('audioCodecType' in copyOptions) {
	            message.audio['codec_type'] = copyOptions.audioCodecType;
	        }
	        if ('audioBitRate' in copyOptions) {
	            message.audio['bit_rate'] = copyOptions.audioBitRate;
	        }
	    }
	    const hasAudioOpusParamsProperty = Object.keys(copyOptions).some((key) => {
	        return 0 <= audioOpusParamsPropertyKeys.indexOf(key);
	    });
	    if (message.audio && hasAudioOpusParamsProperty) {
	        if (typeof message.audio != 'object') {
	            message.audio = {};
	        }
	        message.audio.opus_params = {};
	        if ('audioOpusParamsChannels' in copyOptions) {
	            message.audio.opus_params.channels = copyOptions.audioOpusParamsChannels;
	        }
	        if ('audioOpusParamsMaxplaybackrate' in copyOptions) {
	            message.audio.opus_params.maxplaybackrate = copyOptions.audioOpusParamsMaxplaybackrate;
	        }
	        if ('audioOpusParamsStereo' in copyOptions) {
	            message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo;
	        }
	        if ('audioOpusParamsSpropStereo' in copyOptions) {
	            message.audio.opus_params.sprop_stereo = copyOptions.audioOpusParamsSpropStereo;
	        }
	        if ('audioOpusParamsMinptime' in copyOptions) {
	            message.audio.opus_params.minptime = copyOptions.audioOpusParamsMinptime;
	        }
	        if ('audioOpusParamsPtime' in copyOptions) {
	            message.audio.opus_params.ptime = copyOptions.audioOpusParamsPtime;
	        }
	        if ('audioOpusParamsUseinbandfec' in copyOptions) {
	            message.audio.opus_params.useinbandfec = copyOptions.audioOpusParamsUseinbandfec;
	        }
	        if ('audioOpusParamsUsedtx' in copyOptions) {
	            message.audio.opus_params.usedtx = copyOptions.audioOpusParamsUsedtx;
	        }
	    }
	    if (message.audio && options.audioCodecType == 'LYRA') {
	        if (typeof message.audio != 'object') {
	            message.audio = {};
	        }
	        message.audio.lyra_params = { version: LYRA_VERSION };
	        if ('audioLyraParamsBitrate' in copyOptions) {
	            message.audio.lyra_params.bitrate = copyOptions.audioLyraParamsBitrate;
	        }
	        if ('audioLyraParamsUsedtx' in copyOptions) {
	            message.audio.lyra_params.usedtx = copyOptions.audioLyraParamsUsedtx;
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
	        if ('videoCodecType' in copyOptions) {
	            message.video['codec_type'] = copyOptions.videoCodecType;
	        }
	        if ('videoBitRate' in copyOptions) {
	            message.video['bit_rate'] = copyOptions.videoBitRate;
	        }
	        if ('videoVP9Params' in copyOptions) {
	            message.video['vp9_params'] = copyOptions.videoVP9Params;
	        }
	        if ('videoH264Params' in copyOptions) {
	            message.video['h264_params'] = copyOptions.videoH264Params;
	        }
	        if ('videoAV1Params' in copyOptions) {
	            message.video['av1_params'] = copyOptions.videoAV1Params;
	        }
	    }
	    if (message.simulcast && !enabledSimulcast() && role !== 'recvonly') {
	        throw new Error('Simulcast can not be used with this browser');
	    }
	    if (typeof options.e2ee === 'boolean') {
	        message.e2ee = options.e2ee;
	    }
	    if (options.e2ee === true) {
	        if (message.signaling_notify_metadata === undefined) {
	            message.signaling_notify_metadata = {};
	        }
	        if (message.signaling_notify_metadata === null ||
	            typeof message.signaling_notify_metadata !== 'object') {
	            throw new Error("E2EE failed. Options signalingNotifyMetadata must be type 'object'");
	        }
	        if (message.video === true) {
	            message.video = {};
	        }
	        if (message.video) {
	            message.video['codec_type'] = 'VP8';
	        }
	    }
	    if (Array.isArray(options.dataChannels) && 0 < options.dataChannels.length) {
	        message.data_channels = parseDataChannelConfigurations(options.dataChannels);
	    }
	    if (options.audioStreamingLanguageCode !== undefined) {
	        message.audio_streaming_language_code = options.audioStreamingLanguageCode;
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
	    if (typeof message === 'object' && message !== null && 'pre_key_bundle' in message) {
	        return message.pre_key_bundle;
	    }
	    return null;
	}
	function trace(clientId, title, value) {
	    const dump = (record) => {
	        if (record && typeof record === 'object') {
	            let keys = null;
	            try {
	                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
	    let prefix = '';
	    if (window.performance) {
	        prefix = '[' + (window.performance.now() / 1000).toFixed(3) + ']';
	    }
	    if (clientId) {
	        prefix = prefix + '[' + clientId + ']';
	    }
	    if (console.info !== undefined && console.group !== undefined) {
	        console.group(prefix + ' ' + title);
	        dump(value);
	        console.groupEnd();
	    }
	    else {
	        console.log(prefix + ' ' + title + '\n', value);
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
	    const event = new Event('message');
	    event.label = label;
	    event.data = data;
	    return event;
	}
	function createDataChannelEvent(channel) {
	    const event = new Event('datachannel');
	    event.datachannel = channel;
	    return event;
	}
	function parseDataChannelEventData(eventData, compress) {
	    if (compress) {
	        const unzlibMessage = unzlibSync(new Uint8Array(eventData));
	        return new TextDecoder().decode(unzlibMessage);
	    }
	    return eventData;
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
	        /**
	         * mid と AudioCodecType の対応づけを保持するマップ
	         *
	         * Lyra などのカスタム音声コーデック使用時に RTCRtpReceiver をどのコーデックでデコードすべきかを
	         * 判別するために使われる
	         *
	         * カスタム音声コーデックが有効になっていない場合には空のままとなる
	         */
	        this.midToAudioCodecType = new Map();
	        /**
	         * キーとなる sender が setupSenderTransform で初期化済みかどうか
	         */
	        this.senderStreamInitialized = new WeakSet();
	        this.role = role;
	        this.channelId = channelId;
	        this.metadata = metadata;
	        this.signalingUrlCandidates = signalingUrlCandidates;
	        this.options = options;
	        // connection timeout の初期値をセットする
	        this.connectionTimeout = 60000;
	        if (typeof this.options.timeout === 'number') {
	            console.warn('@deprecated timeout option will be removed in a future version. Use connectionTimeout.');
	            this.connectionTimeout = this.options.timeout;
	        }
	        if (typeof this.options.connectionTimeout === 'number') {
	            this.connectionTimeout = this.options.connectionTimeout;
	        }
	        // WebSocket/DataChannel の disconnect timeout の初期値をセットする
	        this.disconnectWaitTimeout = 3000;
	        if (typeof this.options.disconnectWaitTimeout === 'number') {
	            this.disconnectWaitTimeout = this.options.disconnectWaitTimeout;
	        }
	        // signalingUrlCandidates に設定されている URL への接続チェック timeout の初期値をセットする
	        this.signalingCandidateTimeout = 3000;
	        if (typeof this.options.signalingCandidateTimeout === 'number') {
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
	            audio: '',
	            video: '',
	        };
	        this.signalingSwitched = false;
	        this.signalingOfferMessageDataChannels = {};
	        this.connectedSignalingUrl = '';
	        this.contactSignalingUrl = '';
	        if (isLyraInitialized()) {
	            this.lyra = new LyraState();
	        }
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
	        if (kind === 'addstream') {
	            console.warn('@deprecated addstream callback will be removed in a future version. Use track callback.');
	        }
	        else if (kind === 'removestream') {
	            console.warn('@deprecated removestream callback will be removed in a future version. Use removetrack callback.');
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
	            throw new Error('Unable to set an audio track. Audio track sender is undefined');
	        }
	        stream.addTrack(audioTrack);
	        await transceiver.sender.replaceTrack(audioTrack);
	        await this.setupSenderTransform(transceiver.sender);
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
	            throw new Error('Unable to set video track. Video track sender is undefined');
	        }
	        stream.addTrack(videoTrack);
	        await transceiver.sender.replaceTrack(videoTrack);
	        await this.setupSenderTransform(transceiver.sender);
	    }
	    /**
	     * connect 処理中に例外が発生した場合の切断処理をするメソッド
	     */
	    signalingTerminate() {
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
	    abendPeerConnectionState(title) {
	        this.clearMonitorIceConnectionStateChange();
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
	                this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason });
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
	                    this.writeDataChannelTimelineLog('onclose', channel);
	                    this.trace('CLOSE DATA CHANNEL', channel.label);
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
	        const event = this.soraCloseEvent('abend', title);
	        this.callbacks.disconnect(event);
	        this.writeSoraTimelineLog('disconnect-abend', event);
	    }
	    /**
	     * 何かしらの異常があった場合の切断処理
	     *
	     * @param title - disconnect callback に渡すイベントのタイトル
	     * @param params - 切断時の状況を入れる Record
	     */
	    async abend(title, params) {
	        this.clearMonitorIceConnectionStateChange();
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
	                this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason });
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
	                    this.writeDataChannelTimelineLog('onclose', channel);
	                    this.trace('CLOSE DATA CHANNEL', channel.label);
	                };
	                dataChannel.onmessage = null;
	                dataChannel.onerror = null;
	            }
	        }
	        // 終了処理を開始する
	        if (this.soraDataChannels.signaling) {
	            const message = { type: 'disconnect', reason: title };
	            if (this.signalingOfferMessageDataChannels.signaling &&
	                this.signalingOfferMessageDataChannels.signaling.compress === true) {
	                const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
	                const zlibMessage = zlibSync(binaryMessage, {});
	                if (this.soraDataChannels.signaling.readyState === 'open') {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(zlibMessage);
	                        this.writeDataChannelSignalingLog('send-disconnect', this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog('failed-to-send-disconnect', this.soraDataChannels.signaling, errorMessage);
	                    }
	                }
	            }
	            else {
	                if (this.soraDataChannels.signaling.readyState === 'open') {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(JSON.stringify(message));
	                        this.writeDataChannelSignalingLog('send-disconnect', this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog('failed-to-send-disconnect', this.soraDataChannels.signaling, errorMessage);
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
	        if (title === 'WEBSOCKET-ONCLOSE' && params && (params.code === 1000 || params.code === 1005)) {
	            const event = this.soraCloseEvent('normal', 'DISCONNECT', params);
	            this.writeSoraTimelineLog('disconnect-normal', event);
	            this.callbacks.disconnect(event);
	            return;
	        }
	        const event = this.soraCloseEvent('abend', title, params);
	        this.writeSoraTimelineLog('disconnect-abend', event);
	        this.callbacks.disconnect(this.soraCloseEvent('abend', title, params));
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
	            audio: '',
	            video: '',
	        };
	        this.signalingSwitched = false;
	        this.signalingOfferMessageDataChannels = {};
	        this.contactSignalingUrl = '';
	        this.connectedSignalingUrl = '';
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
	                this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason });
	                return resolve({ code: event.code, reason: event.reason });
	            };
	            if (this.ws.readyState === 1) {
	                const message = { type: 'disconnect', reason: title };
	                this.ws.send(JSON.stringify(message));
	                this.writeWebSocketSignalingLog('send-disconnect', message);
	                // WebSocket 切断を待つ
	                timerId = setTimeout(() => {
	                    if (this.ws) {
	                        this.ws.close();
	                        this.ws = null;
	                    }
	                    resolve({ code: 1006, reason: '' });
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
	                return resolve({ code: 4999, reason: '' });
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
	                        return resolve({ code: 4999, reason: '' });
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
	                                if (dataChannel.readyState === 'closed') {
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
	                    resolve({ code: 4999, reason: '' });
	                }
	            })
	                .finally(() => {
	                closeDataChannels();
	                clearTimeout(disconnectWaitTimeoutId);
	            });
	            const message = { type: 'disconnect', reason: 'NO-ERROR' };
	            if (this.signalingOfferMessageDataChannels.signaling &&
	                this.signalingOfferMessageDataChannels.signaling.compress === true) {
	                const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
	                const zlibMessage = zlibSync(binaryMessage, {});
	                if (this.soraDataChannels.signaling.readyState === 'open') {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(zlibMessage);
	                        this.writeDataChannelSignalingLog('send-disconnect', this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog('failed-to-send-disconnect', this.soraDataChannels.signaling, errorMessage);
	                    }
	                }
	            }
	            else {
	                if (this.soraDataChannels.signaling.readyState === 'open') {
	                    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
	                    try {
	                        this.soraDataChannels.signaling.send(JSON.stringify(message));
	                        this.writeDataChannelSignalingLog('send-disconnect', this.soraDataChannels.signaling, message);
	                    }
	                    catch (e) {
	                        const errorMessage = e.message;
	                        this.writeDataChannelSignalingLog('failed-to-send-disconnect', this.soraDataChannels.signaling, errorMessage);
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
	            if (this.pc && this.pc.connectionState !== 'closed') {
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
	                this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason });
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
	                    this.writeDataChannelTimelineLog('onclose', channel);
	                    this.trace('CLOSE DATA CHANNEL', channel.label);
	                };
	            }
	        }
	        let event = null;
	        if (this.signalingSwitched) {
	            // DataChannel の切断処理がタイムアウトした場合は event を abend に差し替える
	            try {
	                const reason = await this.disconnectDataChannel();
	                if (reason !== null) {
	                    event = this.soraCloseEvent('normal', 'DISCONNECT', reason);
	                }
	            }
	            catch (_) {
	                event = this.soraCloseEvent('abend', 'DISCONNECT-TIMEOUT');
	            }
	            await this.disconnectWebSocket('NO-ERROR');
	            await this.disconnectPeerConnection();
	        }
	        else {
	            const reason = await this.disconnectWebSocket('NO-ERROR');
	            await this.disconnectPeerConnection();
	            if (reason !== null) {
	                event = this.soraCloseEvent('normal', 'DISCONNECT', reason);
	            }
	        }
	        if (this.e2ee) {
	            this.e2ee.terminateWorker();
	        }
	        this.initializeConnection();
	        if (event) {
	            if (event.type === 'abend') {
	                this.writeSoraTimelineLog('disconnect-abend', event);
	            }
	            else if (event.type === 'normal') {
	                this.writeSoraTimelineLog('disconnect-normal', event);
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
	                await this.abend('INTERNAL-ERROR', { reason: 'CRASH-E2EE-WORKER' });
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
	        if (typeof signalingUrlCandidates === 'string') {
	            // signaling url の候補が文字列の場合
	            const signalingUrl = signalingUrlCandidates;
	            return new Promise((resolve, reject) => {
	                const ws = new WebSocket(signalingUrl);
	                ws.onclose = (event) => {
	                    const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                    error.code = event.code;
	                    error.reason = event.reason;
	                    this.writeWebSocketTimelineLog('onclose', error);
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
	                        this.writeWebSocketSignalingLog('signaling-url-candidate', {
	                            type: 'timeout',
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
	                        this.writeWebSocketSignalingLog('signaling-url-candidate', {
	                            type: 'close',
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
	                        this.writeWebSocketSignalingLog('signaling-url-candidate', {
	                            type: 'error',
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
	                                this.writeWebSocketSignalingLog('signaling-url-candidate', {
	                                    type: 'open',
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
	                                this.writeWebSocketSignalingLog('signaling-url-candidate', {
	                                    type: 'open',
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
	                throw new ConnectError('Signaling failed. All signaling URL candidates failed to connect');
	            }
	        }
	        throw new ConnectError('Signaling failed. Invalid format signaling URL candidates');
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
	        this.trace('CREATE OFFER', offer);
	        return new Promise((resolve, reject) => {
	            this.writeWebSocketSignalingLog('new-websocket', ws.url);
	            // websocket の各 callback を設定する
	            ws.binaryType = 'arraybuffer';
	            ws.onclose = (event) => {
	                const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                error.code = event.code;
	                error.reason = event.reason;
	                this.writeWebSocketTimelineLog('onclose', error);
	                this.signalingTerminate();
	                reject(error);
	            };
	            ws.onmessage = async (event) => {
	                // E2EE 時専用処理
	                if (event.data instanceof ArrayBuffer) {
	                    this.writeWebSocketSignalingLog('onmessage-e2ee', event.data);
	                    this.signalingOnMessageE2EE(event.data);
	                    return;
	                }
	                if (typeof event.data !== 'string') {
	                    throw new Error('Received invalid signaling data');
	                }
	                const message = JSON.parse(event.data);
	                if (message.type == 'offer') {
	                    this.writeWebSocketSignalingLog('onmessage-offer', message);
	                    this.signalingOnMessageTypeOffer(message);
	                    this.connectedSignalingUrl = ws.url;
	                    resolve(message);
	                }
	                else if (message.type == 'update') {
	                    this.writeWebSocketSignalingLog('onmessage-update', message);
	                    await this.signalingOnMessageTypeUpdate(message);
	                }
	                else if (message.type == 're-offer') {
	                    this.writeWebSocketSignalingLog('onmessage-re-offer', message);
	                    await this.signalingOnMessageTypeReOffer(message);
	                }
	                else if (message.type == 'ping') {
	                    await this.signalingOnMessageTypePing(message);
	                }
	                else if (message.type == 'push') {
	                    this.callbacks.push(message, 'websocket');
	                }
	                else if (message.type == 'notify') {
	                    if (message.event_type === 'connection.created') {
	                        this.writeWebSocketTimelineLog('notify-connection.created', message);
	                    }
	                    else if (message.event_type === 'connection.destroyed') {
	                        this.writeWebSocketTimelineLog('notify-connection.destroyed', message);
	                    }
	                    this.signalingOnMessageTypeNotify(message, 'websocket');
	                }
	                else if (message.type == 'switched') {
	                    this.writeWebSocketSignalingLog('onmessage-switched', message);
	                    this.signalingOnMessageTypeSwitched(message);
	                }
	                else if (message.type == 'redirect') {
	                    this.writeWebSocketSignalingLog('onmessage-redirect', message);
	                    try {
	                        const redirectMessage = await this.signalingOnMessageTypeRedirect(message);
	                        resolve(redirectMessage);
	                    }
	                    catch (error) {
	                        reject(error);
	                    }
	                }
	            };
	            (async () => {
	                let signalingMessage;
	                try {
	                    signalingMessage = createSignalingMessage(offer.sdp || '', this.role, this.channelId, this.metadata, this.options, redirect);
	                }
	                catch (error) {
	                    reject(error);
	                    return;
	                }
	                if (signalingMessage.e2ee && this.e2ee) {
	                    const initResult = await this.e2ee.init();
	                    // @ts-ignore signalingMessage の e2ee が true の場合は signalingNotifyMetadata が必ず object になる
	                    signalingMessage['signaling_notify_metadata']['pre_key_bundle'] = initResult;
	                }
	                this.trace('SIGNALING CONNECT MESSAGE', signalingMessage);
	                if (ws) {
	                    ws.send(JSON.stringify(signalingMessage));
	                    this.writeWebSocketSignalingLog(`send-${signalingMessage.type}`, signalingMessage);
	                    this.ws = ws;
	                    // 初回に接続した URL を状態管理する
	                    if (!redirect) {
	                        this.contactSignalingUrl = ws.url;
	                        this.writeWebSocketSignalingLog('contact-signaling-url', this.contactSignalingUrl);
	                    }
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
	        if (this.e2ee || this.lyra) {
	            // @ts-ignore https://w3c.github.io/webrtc-encoded-transform/#specification
	            config = Object.assign({ encodedInsertableStreams: true }, config);
	        }
	        if (window.RTCPeerConnection.generateCertificate !== undefined) {
	            const certificate = await window.RTCPeerConnection.generateCertificate({
	                name: 'ECDSA',
	                namedCurve: 'P-256',
	            });
	            config = Object.assign({ certificates: [certificate] }, config);
	        }
	        this.trace('PEER CONNECTION CONFIG', config);
	        this.writePeerConnectionTimelineLog('new-peerconnection', config);
	        // @ts-ignore Chrome の場合は第2引数に goog オプションを渡すことができる
	        this.pc = new window.RTCPeerConnection(config, this.constraints);
	        this.pc.oniceconnectionstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog('oniceconnectionstatechange', {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	                this.trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this.pc.iceConnectionState);
	            }
	        };
	        this.pc.onicegatheringstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog('onicegatheringstatechange', {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	            }
	        };
	        this.pc.onconnectionstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog('onconnectionstatechange', {
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
	        const sdp = this.processOfferSdp(message.sdp);
	        const sessionDescription = new RTCSessionDescription({ type: 'offer', sdp });
	        await this.pc.setRemoteDescription(sessionDescription);
	        this.writePeerConnectionTimelineLog('set-remote-description', sessionDescription);
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
	            if (transceiver && transceiver.direction === 'recvonly') {
	                transceiver.direction = 'sendrecv';
	            }
	        }
	        // simulcast の場合
	        if (this.options.simulcast && (this.role === 'sendrecv' || this.role === 'sendonly')) {
	            const transceiver = this.pc.getTransceivers().find((t) => {
	                if (t.mid === null) {
	                    return;
	                }
	                if (t.sender.track === null) {
	                    return;
	                }
	                if (t.currentDirection !== null && t.currentDirection !== 'sendonly') {
	                    return;
	                }
	                if (this.mids.video !== '' && this.mids.video === t.mid) {
	                    return t;
	                }
	                if (0 <= t.mid.indexOf('video')) {
	                    return t;
	                }
	            });
	            if (transceiver) {
	                await this.setSenderParameters(transceiver, this.encodings);
	                await this.setRemoteDescription(message);
	                this.trace('TRANSCEIVER SENDER GET_PARAMETERS', transceiver.sender.getParameters());
	                // setRemoteDescription 後でないと active が反映されないのでもう一度呼ぶ
	                await this.setSenderParameters(transceiver, this.encodings);
	                const sessionDescription = await this.pc.createAnswer();
	                // TODO(sile): 動作確認
	                if (sessionDescription.sdp !== undefined) {
	                    sessionDescription.sdp = this.processAnswerSdpForLocal(sessionDescription.sdp);
	                }
	                await this.pc.setLocalDescription(sessionDescription);
	                this.trace('TRANSCEIVER SENDER GET_PARAMETERS', transceiver.sender.getParameters());
	                return;
	            }
	        }
	        const sessionDescription = await this.pc.createAnswer();
	        if (sessionDescription.sdp !== undefined) {
	            sessionDescription.sdp = this.processAnswerSdpForLocal(sessionDescription.sdp);
	        }
	        this.writePeerConnectionTimelineLog('create-answer', sessionDescription);
	        await this.pc.setLocalDescription(sessionDescription);
	        this.writePeerConnectionTimelineLog('set-local-description', sessionDescription);
	        return;
	    }
	    /**
	     * カスタムコーデック対応用に offer SDP を処理するメソッド
	     *
	     * @param sdp offer SDP
	     * @returns 処理後の SDP
	     */
	    processOfferSdp(sdp) {
	        if (isFirefox()) {
	            // 同じ mid が採用される際にはもう使用されない transceiver を解放するために
	            // port に 0 が指定された SDP が送られてくる。
	            // ただし Firefox (バージョン 109.0 で確認) はこれを正常に処理できず、
	            // port で 0 が指定された場合には onremovetrack イベントが発行されないので、
	            // ワークアラウンドとしてここで SDP の置換を行っている。
	            sdp = sdp.replace(/^m=(audio|video) 0 /gm, (_match, kind) => `m=${kind} 9 `);
	        }
	        this.midToAudioCodecType.clear();
	        if (this.lyra === undefined || !sdp.includes('109 lyra/')) {
	            return sdp;
	        }
	        // mid と音声コーデックの対応を保存する
	        for (const media of sdp.split(/^m=/m).slice(1)) {
	            if (!media.startsWith('audio')) {
	                continue;
	            }
	            const mid = /a=mid:(.*)/.exec(media);
	            if (mid) {
	                const codecType = media.includes('109 lyra/') ? 'LYRA' : 'OPUS';
	                this.midToAudioCodecType.set(mid[1], codecType);
	            }
	        }
	        return this.lyra.processOfferSdp(sdp);
	    }
	    /**
	     * カスタムコーデック用に answer SDP を処理するメソッド
	     *
	     * 処理後の SDP は setLocalDescription() メソッドに渡される
	     *
	     * @param answer SDP
	     * @returns 処理後の SDP
	     */
	    processAnswerSdpForLocal(sdp) {
	        if (this.lyra === undefined) {
	            return sdp;
	        }
	        return this.lyra.processAnswerSdpForLocal(sdp);
	    }
	    /**
	     * カスタムコーデック用に answer SDP を処理するメソッド
	     *
	     * 処理後の SDP は Sora に送信される
	     *
	     * @param answer SDP
	     * @returns 処理後の SDP
	     */
	    processAnswerSdpForSora(sdp) {
	        if (this.lyra === undefined) {
	            return sdp;
	        }
	        return this.lyra.processAnswerSdpForSora(sdp);
	    }
	    /**
	     * E2EE あるいはカスタムコーデックが有効になっている場合に、送信側の WebRTC Encoded Transform をセットアップする
	     *
	     * @param sender 対象となる RTCRtpSender インスタンス
	     */
	    async setupSenderTransform(sender) {
	        if ((this.e2ee === null && this.lyra === undefined) || sender.track === null) {
	            return;
	        }
	        // 既に初期化済み
	        if (this.senderStreamInitialized.has(sender)) {
	            return;
	        }
	        const isLyraCodec = sender.track.kind === 'audio' && this.options.audioCodecType === 'LYRA';
	        if ('transform' in RTCRtpSender.prototype) {
	            // WebRTC Encoded Transform に対応しているブラウザ
	            if (!isLyraCodec || this.lyra === undefined) {
	                return;
	            }
	            const lyraWorker = createLyraWorker();
	            const lyraEncoder = await this.lyra.createEncoder();
	            // @ts-ignore
	            sender.transform = new RTCRtpScriptTransform(lyraWorker, {
	                name: 'senderTransform',
	                lyraEncoder,
	            }, [lyraEncoder.port]);
	        }
	        else {
	            // 古い API (i.e., createEncodedStreams) を使っているブラウザ
	            // @ts-ignore
	            // eslint-disable-next-line
	            const senderStreams = sender.createEncodedStreams();
	            let readable = senderStreams.readable;
	            if (isLyraCodec && this.lyra !== undefined) {
	                const lyraEncoder = await this.lyra.createEncoder();
	                const transformStream = new TransformStream({
	                    transform: (data, controller) => transformPcmToLyra(lyraEncoder, data, controller),
	                });
	                readable = senderStreams.readable.pipeThrough(transformStream);
	            }
	            if (this.e2ee) {
	                this.e2ee.setupSenderTransform(readable, senderStreams.writable);
	            }
	            else {
	                readable.pipeTo(senderStreams.writable).catch((e) => console.warn(e));
	            }
	        }
	        this.senderStreamInitialized.add(sender);
	    }
	    /**
	     * E2EE あるいはカスタムコーデックが有効になっている場合に、受信側の WebRTC Encoded Transform をセットアップする
	     *
	     * @param mid コーデックの判別に使う mid
	     * @param receiver 対象となる RTCRtpReceiver インスタンス
	     */
	    async setupReceiverTransform(mid, receiver) {
	        if (this.e2ee === null && this.lyra === undefined) {
	            return;
	        }
	        const codecType = this.midToAudioCodecType.get(mid || '');
	        if ('transform' in RTCRtpSender.prototype) {
	            // WebRTC Encoded Transform に対応しているブラウザ
	            if (codecType !== 'LYRA' || this.lyra === undefined) {
	                return;
	            }
	            const lyraWorker = createLyraWorker();
	            const lyraDecoder = await this.lyra.createDecoder();
	            // @ts-ignore
	            receiver.transform = new RTCRtpScriptTransform(lyraWorker, {
	                name: 'receiverTransform',
	                lyraDecoder,
	            }, [lyraDecoder.port]);
	        }
	        else {
	            // 古い API (i.e., createEncodedStreams) を使っているブラウザ
	            // @ts-ignore
	            // eslint-disable-next-line
	            const receiverStreams = receiver.createEncodedStreams();
	            let writable = receiverStreams.writable;
	            if (codecType === 'LYRA' && this.lyra !== undefined) {
	                const lyraDecoder = await this.lyra.createDecoder();
	                const transformStream = new TransformStream({
	                    transform: (data, controller) => transformLyraToPcm(lyraDecoder, data, controller),
	                });
	                transformStream.readable.pipeTo(receiverStreams.writable).catch((e) => console.warn(e));
	                writable = transformStream.writable;
	            }
	            if (this.e2ee) {
	                this.e2ee.setupReceiverTransform(receiverStreams.readable, writable);
	            }
	            else {
	                receiverStreams.readable.pipeTo(writable).catch((e) => console.warn(e));
	            }
	        }
	    }
	    /**
	     * シグナリングサーバーに type answer を投げるメソッド
	     */
	    sendAnswer() {
	        if (this.pc && this.ws && this.pc.localDescription) {
	            this.trace('ANSWER SDP', this.pc.localDescription.sdp);
	            const sdp = this.processAnswerSdpForSora(this.pc.localDescription.sdp);
	            const message = { type: 'answer', sdp };
	            this.ws.send(JSON.stringify(message));
	            this.writeWebSocketSignalingLog('send-answer', message);
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
	                        this.writePeerConnectionTimelineLog('oniceconnectionstatechange', {
	                            connectionState: this.pc.connectionState,
	                            iceConnectionState: this.pc.iceConnectionState,
	                            iceGatheringState: this.pc.iceGatheringState,
	                        });
	                        this.trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this.pc.iceConnectionState);
	                        if (this.pc.iceConnectionState === 'connected') {
	                            resolve();
	                        }
	                    }
	                };
	                this.pc.onicecandidate = (event) => {
	                    this.writePeerConnectionTimelineLog('onicecandidate', event.candidate);
	                    if (this.pc) {
	                        this.trace('ONICECANDIDATE ICEGATHERINGSTATE', this.pc.iceGatheringState);
	                    }
	                    // TODO(yuito): Firefox は <empty string> を投げてくるようになったので対応する
	                    if (event.candidate === null) {
	                        resolve();
	                    }
	                    else {
	                        const candidate = event.candidate.toJSON();
	                        const message = Object.assign(candidate, { type: 'candidate' });
	                        this.trace('ONICECANDIDATE CANDIDATE MESSAGE', message);
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
	                else if (this.pc && this.pc.connectionState === 'connected') {
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
	                this.ws.onclose = (event) => {
	                    const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                    error.code = event.code;
	                    error.reason = event.reason;
	                    this.writeWebSocketTimelineLog('onclose', error);
	                    this.signalingTerminate();
	                    reject(error);
	                };
	                this.ws.onerror = (_) => {
	                    const error = new ConnectError(`Signaling failed. WebSocket onerror was called`);
	                    this.writeWebSocketSignalingLog('onerror', error);
	                    this.signalingTerminate();
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
	            this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason });
	            await this.abend('WEBSOCKET-ONCLOSE', { code: event.code, reason: event.reason });
	        };
	        this.ws.onerror = async (_) => {
	            this.writeWebSocketSignalingLog('onerror');
	            await this.abend('WEBSOCKET-ONERROR');
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
	        this.pc.oniceconnectionstatechange = (_) => {
	            // connectionState が undefined の場合は iceConnectionState を見て判定する
	            if (this.pc && this.pc.connectionState === undefined) {
	                this.writePeerConnectionTimelineLog('oniceconnectionstatechange', {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	                this.trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this.pc.iceConnectionState);
	                clearTimeout(this.monitorIceConnectionStateChangeTimerId);
	                // iceConnectionState "failed" で切断する
	                if (this.pc.iceConnectionState === 'failed') {
	                    this.abendPeerConnectionState('ICE-CONNECTION-STATE-FAILED');
	                }
	                // iceConnectionState "disconnected" になってから 10000ms の間変化がない場合切断する
	                else if (this.pc.iceConnectionState === 'disconnected') {
	                    this.monitorIceConnectionStateChangeTimerId = setTimeout(() => {
	                        if (this.pc && this.pc.iceConnectionState === 'disconnected') {
	                            this.abendPeerConnectionState('ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT');
	                        }
	                    }, 10000);
	                }
	            }
	        };
	        this.pc.onconnectionstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog('onconnectionstatechange', {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	                if (this.pc.connectionState === 'failed') {
	                    this.abendPeerConnectionState('CONNECTION-STATE-FAILED');
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
	                this.connectionTimeoutTimerId = setTimeout(() => {
	                    if (!this.pc ||
	                        (this.pc &&
	                            this.pc.connectionState !== undefined &&
	                            this.pc.connectionState !== 'connected')) {
	                        const error = new Error();
	                        error.message = 'Signaling connection timeout';
	                        this.callbacks.timeout();
	                        this.trace('DISCONNECT', 'Signaling connection timeout');
	                        this.writePeerConnectionTimelineLog('signaling-connection-timeout', {
	                            connectionTimeout: this.connectionTimeout,
	                        });
	                        this.signalingTerminate();
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
	        this.callbacks.signaling(createSignalingEvent(eventType, data, 'websocket'));
	        this.writeWebSocketTimelineLog(eventType, data);
	    }
	    /**
	     * DataChannel のシグナリングログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeDataChannelSignalingLog(eventType, channel, data) {
	        this.callbacks.signaling(createSignalingEvent(eventType, data, 'datachannel'));
	        this.writeDataChannelTimelineLog(eventType, channel, data);
	    }
	    /**
	     * WebSocket のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeWebSocketTimelineLog(eventType, data) {
	        const event = createTimelineEvent(eventType, data, 'websocket');
	        this.callbacks.timeline(event);
	    }
	    /**
	     * DataChannel のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeDataChannelTimelineLog(eventType, channel, data) {
	        const event = createTimelineEvent(eventType, data, 'datachannel', channel.id, channel.label);
	        this.callbacks.timeline(event);
	    }
	    /**
	     * PeerConnection のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writePeerConnectionTimelineLog(eventType, data) {
	        const event = createTimelineEvent(eventType, data, 'peerconnection');
	        this.callbacks.timeline(event);
	    }
	    /**
	     * Sora との接続のタイムラインログ処理をするメソッド
	     *
	     * @param eventType - イベントタイプ
	     * @param data - イベントデータ
	     */
	    writeSoraTimelineLog(eventType, data) {
	        const event = createTimelineEvent(eventType, data, 'sora');
	        this.callbacks.timeline(event);
	    }
	    /**
	     * createOffer 処理をするメソッド
	     *
	     * @returns
	     * 生成した RTCSessionDescription を返します
	     */
	    async createOffer() {
	        const config = { iceServers: [] };
	        const pc = new window.RTCPeerConnection(config);
	        if (isSafari()) {
	            pc.addTransceiver('video', { direction: 'recvonly' });
	            pc.addTransceiver('audio', { direction: 'recvonly' });
	            const offer = await pc.createOffer();
	            pc.close();
	            this.writePeerConnectionTimelineLog('create-offer', offer);
	            return offer;
	        }
	        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
	        pc.close();
	        this.writePeerConnectionTimelineLog('create-offer', offer);
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
	        this.trace('SIGNALING OFFER MESSAGE', message);
	        this.trace('OFFER SDP', message.sdp);
	    }
	    /**
	     * シグナリングサーバーに type update を投げるメソッド
	     */
	    sendUpdateAnswer() {
	        if (this.pc && this.ws && this.pc.localDescription) {
	            this.trace('ANSWER SDP', this.pc.localDescription.sdp);
	            this.sendSignalingMessage({ type: 'update', sdp: this.pc.localDescription.sdp });
	        }
	    }
	    /**
	     * シグナリングサーバーに type re-answer を投げるメソッド
	     */
	    sendReAnswer() {
	        if (this.pc && this.pc.localDescription) {
	            this.trace('RE ANSWER SDP', this.pc.localDescription.sdp);
	            this.sendSignalingMessage({ type: 're-answer', sdp: this.pc.localDescription.sdp });
	        }
	    }
	    /**
	     * シグナリングサーバーから受け取った type update メッセージを処理をするメソッド
	     *
	     * @param message - type update メッセージ
	     */
	    async signalingOnMessageTypeUpdate(message) {
	        this.trace('SIGNALING UPDATE MESSGE', message);
	        this.trace('UPDATE SDP', message.sdp);
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
	        this.trace('SIGNALING RE OFFER MESSGE', message);
	        this.trace('RE OFFER SDP', message.sdp);
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
	        const pongMessage = { type: 'pong' };
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
	        if (message.event_type === 'connection.created') {
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
	        else if (message.event_type === 'connection.destroyed') {
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
	        if (message['ignore_disconnect_websocket']) {
	            if (this.ws) {
	                this.ws.onclose = null;
	                this.ws.close();
	                this.ws = null;
	            }
	            this.writeWebSocketSignalingLog('close');
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
	        this.trace('TRANSCEIVER SENDER SET_PARAMETERS', originalParameters);
	        this.writePeerConnectionTimelineLog('transceiver-sender-set-parameters', originalParameters);
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
	        dataChannel.bufferedAmountLowThreshold = 65536;
	        dataChannel.binaryType = 'arraybuffer';
	        this.soraDataChannels[dataChannel.label] = dataChannel;
	        this.writeDataChannelTimelineLog('ondatachannel', dataChannel, createDataChannelData(dataChannel));
	        // onbufferedamountlow
	        dataChannelEvent.channel.onbufferedamountlow = (event) => {
	            const channel = event.currentTarget;
	            this.writeDataChannelTimelineLog('onbufferedamountlow', channel);
	        };
	        // onopen
	        dataChannelEvent.channel.onopen = (event) => {
	            const channel = event.currentTarget;
	            this.trace('OPEN DATA CHANNEL', channel.label);
	            if (channel.label === 'signaling' && this.ws) {
	                this.writeDataChannelSignalingLog('onopen', channel);
	            }
	            else {
	                this.writeDataChannelTimelineLog('onopen', channel);
	            }
	        };
	        // onclose
	        dataChannelEvent.channel.onclose = async (event) => {
	            const channel = event.currentTarget;
	            this.writeDataChannelTimelineLog('onclose', channel);
	            this.trace('CLOSE DATA CHANNEL', channel.label);
	            await this.disconnect();
	        };
	        // onerror
	        dataChannelEvent.channel.onerror = async (event) => {
	            const channel = event.currentTarget;
	            this.writeDataChannelTimelineLog('onerror', channel);
	            this.trace('ERROR DATA CHANNEL', channel.label);
	            await this.abend('DATA-CHANNEL-ONERROR', { params: { label: channel.label } });
	        };
	        // onmessage
	        if (dataChannelEvent.channel.label === 'signaling') {
	            dataChannelEvent.channel.onmessage = async (event) => {
	                const channel = event.currentTarget;
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
	                const message = JSON.parse(data);
	                this.writeDataChannelSignalingLog(`onmessage-${message.type}`, channel, message);
	                if (message.type === 're-offer') {
	                    await this.signalingOnMessageTypeReOffer(message);
	                }
	            };
	        }
	        else if (dataChannelEvent.channel.label === 'notify') {
	            dataChannelEvent.channel.onmessage = (event) => {
	                const channel = event.currentTarget;
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
	                const message = JSON.parse(data);
	                if (message.event_type === 'connection.created') {
	                    this.writeDataChannelTimelineLog('notify-connection.created', channel, message);
	                }
	                else if (message.event_type === 'connection.destroyed') {
	                    this.writeDataChannelTimelineLog('notify-connection.destroyed', channel, message);
	                }
	                this.signalingOnMessageTypeNotify(message, 'datachannel');
	            };
	        }
	        else if (dataChannelEvent.channel.label === 'push') {
	            dataChannelEvent.channel.onmessage = (event) => {
	                const channel = event.currentTarget;
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
	                const message = JSON.parse(data);
	                this.callbacks.push(message, 'datachannel');
	            };
	        }
	        else if (dataChannelEvent.channel.label === 'e2ee') {
	            dataChannelEvent.channel.onmessage = (event) => {
	                const channel = event.currentTarget;
	                const data = event.data;
	                this.signalingOnMessageE2EE(data);
	                this.writeDataChannelSignalingLog('onmessage-e2ee', channel, data);
	            };
	        }
	        else if (dataChannelEvent.channel.label === 'stats') {
	            dataChannelEvent.channel.onmessage = async (event) => {
	                const channel = event.currentTarget;
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
	                const message = JSON.parse(data);
	                if (message.type === 'req-stats') {
	                    const stats = await this.getStats();
	                    this.sendStatsMessage(stats);
	                }
	            };
	        }
	        else if (/^#.*/.exec(dataChannelEvent.channel.label)) {
	            dataChannelEvent.channel.onmessage = (event) => {
	                if (event.currentTarget === null) {
	                    return;
	                }
	                const channel = event.currentTarget;
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const dataChannel = event.target;
	                let data = undefined;
	                if (typeof event.data === 'string') {
	                    data = new TextEncoder().encode(event.data);
	                }
	                else if (event.data instanceof ArrayBuffer) {
	                    data = event.data;
	                }
	                else {
	                    console.warn('Received onmessage event data is not of type String or ArrayBuffer.');
	                }
	                if (data !== undefined) {
	                    if (dataChannelSettings.compress === true) {
	                        data = unzlibSync(new Uint8Array(data)).buffer;
	                    }
	                    this.callbacks.message(createDataChannelMessageEvent(dataChannel.label, data));
	                }
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
	            this.writeDataChannelSignalingLog('send-e2ee', this.soraDataChannels.e2ee, message);
	        }
	        else if (this.ws !== null) {
	            this.ws.send(message);
	            this.writeWebSocketSignalingLog('send-e2ee', message);
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
	                type: 'stats',
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
	            throw new Error('Could not find DataChannel');
	        }
	        if (dataChannel.readyState !== 'open') {
	            throw new Error('Messaging DataChannel is not open');
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
	            if (typeof dataChannel.maxPacketLifeTime === 'number') {
	                messagingDataChannel.maxPacketLifeTime = dataChannel.maxPacketLifeTime;
	            }
	            if (typeof dataChannel.maxRetransmits === 'number') {
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
	        if (this.pc) {
	            for (const sender of this.pc.getSenders()) {
	                await this.setupSenderTransform(sender);
	            }
	        }
	        this.stream = stream;
	        await this.createAnswer(signalingMessage);
	        this.sendAnswer();
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
	            this.pc.ontrack = async (event) => {
	                await this.setupReceiverTransform(event.transceiver.mid, event.receiver);
	                const stream = event.streams[0];
	                if (!stream) {
	                    return;
	                }
	                const data = {
	                    // eslint-disable-next-line @typescript-eslint/naming-convention
	                    'stream.id': stream.id,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog('ontrack', data);
	                if (stream.id === 'default') {
	                    return;
	                }
	                if (stream.id === this.connectionId) {
	                    return;
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
	        if (this.pc) {
	            for (const sender of this.pc.getSenders()) {
	                await this.setupSenderTransform(sender);
	            }
	        }
	        this.stream = stream;
	        await this.createAnswer(signalingMessage);
	        this.sendAnswer();
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
	     */
	    async singleStream() {
	        await this.disconnect();
	        this.setupE2EE();
	        const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
	        const signalingMessage = await this.signaling(ws);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = async (event) => {
	                await this.setupReceiverTransform(event.transceiver.mid, event.receiver);
	                this.stream = event.streams[0];
	                const streamId = this.stream.id;
	                if (streamId === 'default') {
	                    return;
	                }
	                const data = {
	                    // eslint-disable-next-line @typescript-eslint/naming-convention
	                    'stream.id': streamId,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog('ontrack', data);
	                this.callbacks.track(event);
	                this.stream.onremovetrack = (event) => {
	                    this.callbacks.removetrack(event);
	                    if (event.target) {
	                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                        const targetId = event.target.id;
	                        const index = this.remoteConnectionIds.indexOf(targetId);
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
	     */
	    async multiStream() {
	        await this.disconnect();
	        this.setupE2EE();
	        const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
	        const signalingMessage = await this.signaling(ws);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = async (event) => {
	                await this.setupReceiverTransform(event.transceiver.mid, event.receiver);
	                const stream = event.streams[0];
	                if (stream.id === 'default') {
	                    return;
	                }
	                if (stream.id === this.connectionId) {
	                    return;
	                }
	                const data = {
	                    // eslint-disable-next-line @typescript-eslint/naming-convention
	                    'stream.id': stream.id,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog('ontrack', data);
	                this.callbacks.track(event);
	                stream.onremovetrack = (event) => {
	                    this.callbacks.removetrack(event);
	                    if (event.target) {
	                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
	                        const targetId = event.target.id;
	                        const index = this.remoteConnectionIds.indexOf(targetId);
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
	    if (constraints.audio && typeof constraints.audio !== 'boolean') {
	        for (const track of mediastream.getAudioTracks()) {
	            await track.applyConstraints(constraints.audio);
	        }
	    }
	    if (constraints.video && typeof constraints.video !== 'boolean') {
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
	        // sendrecv の場合、multistream に初期値を指定する
	        const sendrecvOptions = Object.assign({ multistream: true }, options);
	        return new ConnectionPublisher(this.signalingUrlCandidates, 'sendrecv', channelId, metadata, sendrecvOptions, this.debug);
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
	        return new ConnectionPublisher(this.signalingUrlCandidates, 'sendonly', channelId, metadata, options, this.debug);
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
	        return new ConnectionSubscriber(this.signalingUrlCandidates, 'recvonly', channelId, metadata, options, this.debug);
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
	     * Lyra の初期化を行うメソッド
	     *
	     * 詳細は lyra.ts の initLyra() メソッドのドキュメントを参照
	     */
	    initLyra,
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
	        return '2023.1.0';
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
