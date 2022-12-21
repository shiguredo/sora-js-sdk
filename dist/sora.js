/**
 * sora-js-sdk
 * WebRTC SFU Sora JavaScript SDK
 * @version: 2022.3.1
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
	    setupSenderTransform(readableStream, writableStream) {
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
	    setupReceiverTransform(readableStream, writableStream) {
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

	/**
	 * @shiguredo/lyra-wasm
	 * Lyra V2 WebAssembly build
	 * @version: 2022.2.0
	 * @author: Shiguredo Inc.
	 * @license: Apache-2.0
	 **/

	var LyraWasmModule = (() => {
	  var _scriptDir = (typeof document === 'undefined' && typeof location === 'undefined' ? new (require('u' + 'rl').URL)('file:' + __filename).href : typeof document === 'undefined' ? location.href : (document.currentScript && document.currentScript.src || new URL('sora.js', document.baseURI).href));
	  
	  return (
	function(LyraWasmModule) {
	  LyraWasmModule = LyraWasmModule || {};

	function GROWABLE_HEAP_I8(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAP8}function GROWABLE_HEAP_U8(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAPU8}function GROWABLE_HEAP_I16(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAP16}function GROWABLE_HEAP_U16(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAPU16}function GROWABLE_HEAP_I32(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAP32}function GROWABLE_HEAP_U32(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAPU32}function GROWABLE_HEAP_F32(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAPF32}function GROWABLE_HEAP_F64(){if(wasmMemory.buffer!=buffer){updateGlobalBufferAndViews(wasmMemory.buffer);}return HEAPF64}var Module=typeof LyraWasmModule!="undefined"?LyraWasmModule:{};var readyPromiseResolve,readyPromiseReject;Module["ready"]=new Promise(function(resolve,reject){readyPromiseResolve=resolve;readyPromiseReject=reject;});var moduleOverrides=Object.assign({},Module);var thisProgram="./this.program";var quit_=(status,toThrow)=>{throw toThrow};var ENVIRONMENT_IS_WEB=typeof window=="object";var ENVIRONMENT_IS_WORKER=typeof importScripts=="function";var ENVIRONMENT_IS_NODE=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string";var ENVIRONMENT_IS_PTHREAD=Module["ENVIRONMENT_IS_PTHREAD"]||false;var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var read_,readAsync,readBinary;function logExceptionOnExit(e){if(e instanceof ExitStatus)return;let toLog=e;err("exiting due to exception: "+toLog);}if(ENVIRONMENT_IS_NODE){if(ENVIRONMENT_IS_WORKER){scriptDirectory=require("path").dirname(scriptDirectory)+"/";}else {scriptDirectory=__dirname+"/";}var fs,nodePath;if(typeof require==="function"){fs=require("fs");nodePath=require("path");}read_=(filename,binary)=>{filename=nodePath["normalize"](filename);return fs.readFileSync(filename,binary?undefined:"utf8")};readBinary=filename=>{var ret=read_(filename,true);if(!ret.buffer){ret=new Uint8Array(ret);}return ret};readAsync=(filename,onload,onerror)=>{filename=nodePath["normalize"](filename);fs.readFile(filename,function(err,data){if(err)onerror(err);else onload(data.buffer);});};if(process["argv"].length>1){thisProgram=process["argv"][1].replace(/\\/g,"/");}process["argv"].slice(2);process["on"]("uncaughtException",function(ex){if(!(ex instanceof ExitStatus)){throw ex}});process["on"]("unhandledRejection",function(reason){throw reason});quit_=(status,toThrow)=>{if(keepRuntimeAlive()){process["exitCode"]=status;throw toThrow}logExceptionOnExit(toThrow);process["exit"](status);};Module["inspect"]=function(){return "[Emscripten Module object]"};let nodeWorkerThreads;try{nodeWorkerThreads=require("worker_threads");}catch(e){console.error('The "worker_threads" module is not supported in this node.js build - perhaps a newer version is needed?');throw e}global.Worker=nodeWorkerThreads.Worker;}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){if(ENVIRONMENT_IS_WORKER){scriptDirectory=self.location.href;}else if(typeof document!="undefined"&&document.currentScript){scriptDirectory=document.currentScript.src;}if(_scriptDir){scriptDirectory=_scriptDir;}if(scriptDirectory.indexOf("blob:")!==0){scriptDirectory=scriptDirectory.substr(0,scriptDirectory.replace(/[?#].*/,"").lastIndexOf("/")+1);}else {scriptDirectory="";}if(!ENVIRONMENT_IS_NODE){read_=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.send(null);return xhr.responseText};if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)};}readAsync=(url,onload,onerror)=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=()=>{if(xhr.status==200||xhr.status==0&&xhr.response){onload(xhr.response);return}onerror();};xhr.onerror=onerror;xhr.send(null);};}}else;if(ENVIRONMENT_IS_NODE){if(typeof performance=="undefined"){global.performance=require("perf_hooks").performance;}}var defaultPrint=console.log.bind(console);var defaultPrintErr=console.warn.bind(console);if(ENVIRONMENT_IS_NODE){defaultPrint=str=>fs.writeSync(1,str+"\n");defaultPrintErr=str=>fs.writeSync(2,str+"\n");}var out=Module["print"]||defaultPrint;var err=Module["printErr"]||defaultPrintErr;Object.assign(Module,moduleOverrides);moduleOverrides=null;if(Module["arguments"])Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];if(Module["quit"])quit_=Module["quit"];var POINTER_SIZE=4;var wasmBinary;if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];var noExitRuntime=Module["noExitRuntime"]||true;if(typeof WebAssembly!="object"){abort("no native wasm support detected");}var wasmMemory;var wasmModule;var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort(text);}}var UTF8Decoder=typeof TextDecoder!="undefined"?new TextDecoder("utf8"):undefined;function UTF8ArrayToString(heapOrArray,idx,maxBytesToRead){var endIdx=idx+maxBytesToRead;var endPtr=idx;while(heapOrArray[endPtr]&&!(endPtr>=endIdx))++endPtr;if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.buffer instanceof SharedArrayBuffer?heapOrArray.slice(idx,endPtr):heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2;}else {u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63;}if(u0<65536){str+=String.fromCharCode(u0);}else {var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023);}}return str}function UTF8ToString(ptr,maxBytesToRead){return ptr?UTF8ArrayToString(GROWABLE_HEAP_U8(),ptr,maxBytesToRead):""}function stringToUTF8Array(str,heap,outIdx,maxBytesToWrite){if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343){var u1=str.charCodeAt(++i);u=65536+((u&1023)<<10)|u1&1023;}if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u;}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63;}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;}else {if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;}}heap[outIdx]=0;return outIdx-startIdx}function stringToUTF8(str,outPtr,maxBytesToWrite){return stringToUTF8Array(str,GROWABLE_HEAP_U8(),outPtr,maxBytesToWrite)}function lengthBytesUTF8(str){var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++;}else if(c<=2047){len+=2;}else if(c>=55296&&c<=57343){len+=4;++i;}else {len+=3;}}return len}var buffer,HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;if(ENVIRONMENT_IS_PTHREAD){buffer=Module["buffer"];}function updateGlobalBufferAndViews(buf){buffer=buf;Module["HEAP8"]=HEAP8=new Int8Array(buf);Module["HEAP16"]=HEAP16=new Int16Array(buf);Module["HEAP32"]=HEAP32=new Int32Array(buf);Module["HEAPU8"]=HEAPU8=new Uint8Array(buf);Module["HEAPU16"]=HEAPU16=new Uint16Array(buf);Module["HEAPU32"]=HEAPU32=new Uint32Array(buf);Module["HEAPF32"]=HEAPF32=new Float32Array(buf);Module["HEAPF64"]=HEAPF64=new Float64Array(buf);}var INITIAL_MEMORY=Module["INITIAL_MEMORY"]||16777216;if(ENVIRONMENT_IS_PTHREAD){wasmMemory=Module["wasmMemory"];buffer=Module["buffer"];}else {if(Module["wasmMemory"]){wasmMemory=Module["wasmMemory"];}else {wasmMemory=new WebAssembly.Memory({"initial":INITIAL_MEMORY/65536,"maximum":2147483648/65536,"shared":true});if(!(wasmMemory.buffer instanceof SharedArrayBuffer)){err("requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag");if(ENVIRONMENT_IS_NODE){err("(on node you may need: --experimental-wasm-threads --experimental-wasm-bulk-memory and/or recent version)");}throw Error("bad memory")}}}if(wasmMemory){buffer=wasmMemory.buffer;}INITIAL_MEMORY=buffer.byteLength;updateGlobalBufferAndViews(buffer);var wasmTable;var __ATPRERUN__=[];var __ATINIT__=[];var __ATPOSTRUN__=[];function keepRuntimeAlive(){return noExitRuntime}function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift());}}callRuntimeCallbacks(__ATPRERUN__);}function initRuntime(){if(ENVIRONMENT_IS_PTHREAD)return;if(!Module["noFSInit"]&&!FS.init.initialized)FS.init();FS.ignorePermissions=false;callRuntimeCallbacks(__ATINIT__);}function postRun(){if(ENVIRONMENT_IS_PTHREAD)return;if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift());}}callRuntimeCallbacks(__ATPOSTRUN__);}function addOnPreRun(cb){__ATPRERUN__.unshift(cb);}function addOnInit(cb){__ATINIT__.unshift(cb);}function addOnPostRun(cb){__ATPOSTRUN__.unshift(cb);}var runDependencies=0;var dependenciesFulfilled=null;function getUniqueRunDependency(id){return id}function addRunDependency(id){runDependencies++;if(Module["monitorRunDependencies"]){Module["monitorRunDependencies"](runDependencies);}}function removeRunDependency(id){runDependencies--;if(Module["monitorRunDependencies"]){Module["monitorRunDependencies"](runDependencies);}if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback();}}}function abort(what){if(Module["onAbort"]){Module["onAbort"](what);}what="Aborted("+what+")";err(what);ABORT=true;EXITSTATUS=1;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);readyPromiseReject(e);throw e}var dataURIPrefix="data:application/octet-stream;base64,";function isDataURI(filename){return filename.startsWith(dataURIPrefix)}function isFileURI(filename){return filename.startsWith("file://")}var wasmBinaryFile;if(Module["locateFile"]){wasmBinaryFile="lyra.wasm";if(!isDataURI(wasmBinaryFile)){wasmBinaryFile=locateFile(wasmBinaryFile);}}else {wasmBinaryFile=new URL("lyra.wasm",(typeof document === 'undefined' && typeof location === 'undefined' ? new (require('u' + 'rl').URL)('file:' + __filename).href : typeof document === 'undefined' ? location.href : (document.currentScript && document.currentScript.src || new URL('sora.js', document.baseURI).href))).toString();}function getBinary(file){try{if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw "both async and sync fetching of the wasm failed"}catch(err){abort(err);}}function getBinaryPromise(){if(!wasmBinary&&(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER)){if(typeof fetch=="function"&&!isFileURI(wasmBinaryFile)){return fetch(wasmBinaryFile,{credentials:"same-origin"}).then(function(response){if(!response["ok"]){throw "failed to load wasm binary file at '"+wasmBinaryFile+"'"}return response["arrayBuffer"]()}).catch(function(){return getBinary(wasmBinaryFile)})}else {if(readAsync){return new Promise(function(resolve,reject){readAsync(wasmBinaryFile,function(response){resolve(new Uint8Array(response));},reject);})}}}return Promise.resolve().then(function(){return getBinary(wasmBinaryFile)})}function createWasm(){var info={"env":asmLibraryArg,"wasi_snapshot_preview1":asmLibraryArg};function receiveInstance(instance,module){var exports=instance.exports;Module["asm"]=exports;registerTLSInit(Module["asm"]["_emscripten_tls_init"]);wasmTable=Module["asm"]["__indirect_function_table"];addOnInit(Module["asm"]["__wasm_call_ctors"]);wasmModule=module;if(!ENVIRONMENT_IS_PTHREAD){removeRunDependency();}}if(!ENVIRONMENT_IS_PTHREAD){addRunDependency();}function receiveInstantiationResult(result){receiveInstance(result["instance"],result["module"]);}function instantiateArrayBuffer(receiver){return getBinaryPromise().then(function(binary){return WebAssembly.instantiate(binary,info)}).then(function(instance){return instance}).then(receiver,function(reason){err("failed to asynchronously prepare wasm: "+reason);abort(reason);})}function instantiateAsync(){if(!wasmBinary&&typeof WebAssembly.instantiateStreaming=="function"&&!isDataURI(wasmBinaryFile)&&!isFileURI(wasmBinaryFile)&&!ENVIRONMENT_IS_NODE&&typeof fetch=="function"){return fetch(wasmBinaryFile,{credentials:"same-origin"}).then(function(response){var result=WebAssembly.instantiateStreaming(response,info);return result.then(receiveInstantiationResult,function(reason){err("wasm streaming compile failed: "+reason);err("falling back to ArrayBuffer instantiation");return instantiateArrayBuffer(receiveInstantiationResult)})})}else {return instantiateArrayBuffer(receiveInstantiationResult)}}if(Module["instantiateWasm"]){try{var exports=Module["instantiateWasm"](info,receiveInstance);return exports}catch(e){err("Module.instantiateWasm callback failed with error: "+e);readyPromiseReject(e);}}instantiateAsync().catch(readyPromiseReject);return {}}var tempDouble;var tempI64;var ASM_CONSTS={209600:()=>{return typeof wasmOffsetConverter!=="undefined"}};function HaveOffsetConverter(){return typeof wasmOffsetConverter!=="undefined"}function _emscripten_set_main_loop_timing(mode,value){Browser.mainLoop.timingMode=mode;Browser.mainLoop.timingValue=value;if(!Browser.mainLoop.func){return 1}if(!Browser.mainLoop.running){Browser.mainLoop.running=true;}if(mode==0){Browser.mainLoop.scheduler=function Browser_mainLoop_scheduler_setTimeout(){var timeUntilNextTick=Math.max(0,Browser.mainLoop.tickStartTime+value-_emscripten_get_now())|0;setTimeout(Browser.mainLoop.runner,timeUntilNextTick);};Browser.mainLoop.method="timeout";}else if(mode==1){Browser.mainLoop.scheduler=function Browser_mainLoop_scheduler_rAF(){Browser.requestAnimationFrame(Browser.mainLoop.runner);};Browser.mainLoop.method="rAF";}else if(mode==2){if(typeof setImmediate=="undefined"){var setImmediates=[];var emscriptenMainLoopMessageId="setimmediate";var Browser_setImmediate_messageHandler=event=>{if(event.data===emscriptenMainLoopMessageId||event.data.target===emscriptenMainLoopMessageId){event.stopPropagation();setImmediates.shift()();}};addEventListener("message",Browser_setImmediate_messageHandler,true);setImmediate=function Browser_emulated_setImmediate(func){setImmediates.push(func);if(ENVIRONMENT_IS_WORKER){if(Module["setImmediates"]===undefined)Module["setImmediates"]=[];Module["setImmediates"].push(func);postMessage({target:emscriptenMainLoopMessageId});}else postMessage(emscriptenMainLoopMessageId,"*");};}Browser.mainLoop.scheduler=function Browser_mainLoop_scheduler_setImmediate(){setImmediate(Browser.mainLoop.runner);};Browser.mainLoop.method="immediate";}return 0}var _emscripten_get_now;if(ENVIRONMENT_IS_NODE){_emscripten_get_now=()=>{var t=process["hrtime"]();return t[0]*1e3+t[1]/1e6};}else if(ENVIRONMENT_IS_PTHREAD){_emscripten_get_now=()=>performance.now()-Module["__performance_now_clock_drift"];}else _emscripten_get_now=()=>performance.now();function ExitStatus(status){this.name="ExitStatus";this.message="Program terminated with exit("+status+")";this.status=status;}var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1);}else if(last===".."){parts.splice(i,1);up++;}else if(up){parts.splice(i,1);up--;}}if(allowAboveRoot){for(;up;up--){parts.unshift("..");}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.substr(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path=".";}if(path&&trailingSlash){path+="/";}return (isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return "."}if(dir){dir=dir.substr(0,dir.length-1);}return root+dir},basename:path=>{if(path==="/")return "/";path=PATH.normalize(path);path=path.replace(/\/$/,"");var lastSlash=path.lastIndexOf("/");if(lastSlash===-1)return path;return path.substr(lastSlash+1)},join:function(){var paths=Array.prototype.slice.call(arguments);return PATH.normalize(paths.join("/"))},join2:(l,r)=>{return PATH.normalize(l+"/"+r)}};function getRandomDevice(){if(typeof crypto=="object"&&typeof crypto["getRandomValues"]=="function"){var randomBuffer=new Uint8Array(1);return ()=>{crypto.getRandomValues(randomBuffer);return randomBuffer[0]}}else if(ENVIRONMENT_IS_NODE){try{var crypto_module=require("crypto");return ()=>crypto_module["randomBytes"](1)[0]}catch(e){}}return ()=>abort("randomDevice")}var PATH_FS={resolve:function(){var resolvedPath="",resolvedAbsolute=false;for(var i=arguments.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?arguments[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return ""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path);}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return (resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).substr(1);to=PATH_FS.resolve(to).substr(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return [];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..");}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};function intArrayFromString(stringy,dontAddNull,length){var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array}var TTY={ttys:[],init:function(){},shutdown:function(){},register:function(dev,ops){TTY.ttys[dev]={input:[],output:[],ops:ops};FS.registerDevice(dev,TTY.stream_ops);},stream_ops:{open:function(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false;},close:function(stream){stream.tty.ops.fsync(stream.tty);},fsync:function(stream){stream.tty.ops.fsync(stream.tty);},read:function(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty);}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result;}if(bytesRead){stream.node.timestamp=Date.now();}return bytesRead},write:function(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i]);}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.timestamp=Date.now();}return i}},default_tty_ops:{get_char:function(tty){if(!tty.input.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;try{bytesRead=fs.readSync(process.stdin.fd,buf,0,BUFSIZE,-1);}catch(e){if(e.toString().includes("EOF"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString("utf-8");}else {result=null;}}else if(typeof window!="undefined"&&typeof window.prompt=="function"){result=window.prompt("Input: ");if(result!==null){result+="\n";}}else if(typeof readline=="function"){result=readline();if(result!==null){result+="\n";}}if(!result){return null}tty.input=intArrayFromString(result,true);}return tty.input.shift()},put_char:function(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output,0));tty.output=[];}else {if(val!=0)tty.output.push(val);}},fsync:function(tty){if(tty.output&&tty.output.length>0){out(UTF8ArrayToString(tty.output,0));tty.output=[];}}},default_tty1_ops:{put_char:function(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output,0));tty.output=[];}else {if(val!=0)tty.output.push(val);}},fsync:function(tty){if(tty.output&&tty.output.length>0){err(UTF8ArrayToString(tty.output,0));tty.output=[];}}}};function zeroMemory(address,size){GROWABLE_HEAP_U8().fill(0,address,address+size);return address}function alignMemory(size,alignment){return Math.ceil(size/alignment)*alignment}function mmapAlloc(size){size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(!ptr)return 0;return zeroMemory(ptr,size)}var MEMFS={ops_table:null,mount:function(mount){return MEMFS.createNode(null,"/",16384|511,0)},createNode:function(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}if(!MEMFS.ops_table){MEMFS.ops_table={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,allocate:MEMFS.stream_ops.allocate,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};}var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={};}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=null;}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream;}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream;}node.timestamp=Date.now();if(parent){parent.contents[name]=node;parent.timestamp=node.timestamp;}return node},getFileDataAsTypedArray:function(node){if(!node.contents)return new Uint8Array(0);if(node.contents.subarray)return node.contents.subarray(0,node.usedBytes);return new Uint8Array(node.contents)},expandFileStorage:function(node,newCapacity){var prevCapacity=node.contents?node.contents.length:0;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity!=0)newCapacity=Math.max(newCapacity,256);var oldContents=node.contents;node.contents=new Uint8Array(newCapacity);if(node.usedBytes>0)node.contents.set(oldContents.subarray(0,node.usedBytes),0);},resizeFileStorage:function(node,newSize){if(node.usedBytes==newSize)return;if(newSize==0){node.contents=null;node.usedBytes=0;}else {var oldContents=node.contents;node.contents=new Uint8Array(newSize);if(oldContents){node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)));}node.usedBytes=newSize;}},node_ops:{getattr:function(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096;}else if(FS.isFile(node.mode)){attr.size=node.usedBytes;}else if(FS.isLink(node.mode)){attr.size=node.link.length;}else {attr.size=0;}attr.atime=new Date(node.timestamp);attr.mtime=new Date(node.timestamp);attr.ctime=new Date(node.timestamp);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr:function(node,attr){if(attr.mode!==undefined){node.mode=attr.mode;}if(attr.timestamp!==undefined){node.timestamp=attr.timestamp;}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size);}},lookup:function(parent,name){throw FS.genericErrors[44]},mknod:function(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename:function(old_node,new_dir,new_name){if(FS.isDir(old_node.mode)){var new_node;try{new_node=FS.lookupNode(new_dir,new_name);}catch(e){}if(new_node){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}}delete old_node.parent.contents[old_node.name];old_node.parent.timestamp=Date.now();old_node.name=new_name;new_dir.contents[new_name]=old_node;new_dir.timestamp=old_node.parent.timestamp;old_node.parent=new_dir;},unlink:function(parent,name){delete parent.contents[name];parent.timestamp=Date.now();},rmdir:function(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.timestamp=Date.now();},readdir:function(node){var entries=[".",".."];for(var key in node.contents){if(!node.contents.hasOwnProperty(key)){continue}entries.push(key);}return entries},symlink:function(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink:function(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read:function(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);if(size>8&&contents.subarray){buffer.set(contents.subarray(position,position+size),offset);}else {for(var i=0;i<size;i++)buffer[offset+i]=contents[position+i];}return size},write:function(stream,buffer,offset,length,position,canOwn){if(buffer.buffer===GROWABLE_HEAP_I8().buffer){canOwn=false;}if(!length)return 0;var node=stream.node;node.timestamp=Date.now();if(buffer.subarray&&(!node.contents||node.contents.subarray)){if(canOwn){node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length;return length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length;return length}else if(position+length<=node.usedBytes){node.contents.set(buffer.subarray(offset,offset+length),position);return length}}MEMFS.expandFileStorage(node,position+length);if(node.contents.subarray&&buffer.subarray){node.contents.set(buffer.subarray(offset,offset+length),position);}else {for(var i=0;i<length;i++){node.contents[position+i]=buffer[offset+i];}}node.usedBytes=Math.max(node.usedBytes,position+length);return length},llseek:function(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position;}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes;}}if(position<0){throw new FS.ErrnoError(28)}return position},allocate:function(stream,offset,length){MEMFS.expandFileStorage(stream.node,offset+length);stream.node.usedBytes=Math.max(stream.node.usedBytes,offset+length);},mmap:function(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents.buffer===buffer){allocated=false;ptr=contents.byteOffset;}else {if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length);}else {contents=Array.prototype.slice.call(contents,position,position+length);}}allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}GROWABLE_HEAP_I8().set(contents,ptr);}return {ptr:ptr,allocated:allocated}},msync:function(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};function asyncLoad(url,onload,onerror,noRunDep){var dep=!noRunDep?getUniqueRunDependency("al "+url):"";readAsync(url,arrayBuffer=>{assert(arrayBuffer,'Loading data file "'+url+'" failed (no arrayBuffer).');onload(new Uint8Array(arrayBuffer));if(dep)removeRunDependency();},event=>{if(onerror){onerror();}else {throw 'Loading data file "'+url+'" failed.'}});if(dep)addRunDependency();}var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,lookupPath:(path,opts={})=>{path=PATH_FS.resolve(path);if(!path)return {path:"",node:null};var defaults={follow_mount:true,recurse_count:0};opts=Object.assign(defaults,opts);if(opts.recurse_count>8){throw new FS.ErrnoError(32)}var parts=path.split("/").filter(p=>!!p);var current=FS.root;var current_path="/";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}current=FS.lookupNode(current,parts[i]);current_path=PATH.join2(current_path,parts[i]);if(FS.isMountpoint(current)){if(!islast||islast&&opts.follow_mount){current=current.mounted.root;}}if(!islast||opts.follow){var count=0;while(FS.isLink(current.mode)){var link=FS.readlink(current_path);current_path=PATH_FS.resolve(PATH.dirname(current_path),link);var lookup=FS.lookupPath(current_path,{recurse_count:opts.recurse_count+1});current=lookup.node;if(count++>40){throw new FS.ErrnoError(32)}}}}return {path:current_path,node:current}},getPath:node=>{var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!=="/"?mount+"/"+path:mount+path}path=path?node.name+"/"+path:node.name;node=node.parent;}},hashName:(parentid,name)=>{var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0;}return (parentid+hash>>>0)%FS.nameTable.length},hashAddNode:node=>{var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node;},hashRemoveNode:node=>{var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next;}else {var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next;}}},lookupNode:(parent,name)=>{var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode,parent)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode:(parent,name,mode,rdev)=>{var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode:node=>{FS.hashRemoveNode(node);},isRoot:node=>{return node===node.parent},isMountpoint:node=>{return !!node.mounted},isFile:mode=>{return (mode&61440)===32768},isDir:mode=>{return (mode&61440)===16384},isLink:mode=>{return (mode&61440)===40960},isChrdev:mode=>{return (mode&61440)===8192},isBlkdev:mode=>{return (mode&61440)===24576},isFIFO:mode=>{return (mode&61440)===4096},isSocket:mode=>{return (mode&49152)===49152},flagModes:{"r":0,"r+":2,"w":577,"w+":578,"a":1089,"a+":1090},modeStringToFlags:str=>{var flags=FS.flagModes[str];if(typeof flags=="undefined"){throw new Error("Unknown file open mode: "+str)}return flags},flagsToPermissionString:flag=>{var perms=["r","w","rw"][flag&3];if(flag&512){perms+="w";}return perms},nodePermissions:(node,perms)=>{if(FS.ignorePermissions){return 0}if(perms.includes("r")&&!(node.mode&292)){return 2}else if(perms.includes("w")&&!(node.mode&146)){return 2}else if(perms.includes("x")&&!(node.mode&73)){return 2}return 0},mayLookup:dir=>{var errCode=FS.nodePermissions(dir,"x");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate:(dir,name)=>{try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,"wx")},mayDelete:(dir,name,isdir)=>{var node;try{node=FS.lookupNode(dir,name);}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,"wx");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else {if(FS.isDir(node.mode)){return 31}}return 0},mayOpen:(node,flags)=>{if(!node){return 44}if(FS.isLink(node.mode)){return 32}else if(FS.isDir(node.mode)){if(FS.flagsToPermissionString(flags)!=="r"||flags&512){return 31}}return FS.nodePermissions(node,FS.flagsToPermissionString(flags))},MAX_OPEN_FDS:4096,nextfd:(fd_start=0,fd_end=FS.MAX_OPEN_FDS)=>{for(var fd=fd_start;fd<=fd_end;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStream:fd=>FS.streams[fd],createStream:(stream,fd_start,fd_end)=>{if(!FS.FSStream){FS.FSStream=function(){this.shared={};};FS.FSStream.prototype={};Object.defineProperties(FS.FSStream.prototype,{object:{get:function(){return this.node},set:function(val){this.node=val;}},isRead:{get:function(){return (this.flags&2097155)!==1}},isWrite:{get:function(){return (this.flags&2097155)!==0}},isAppend:{get:function(){return this.flags&1024}},flags:{get:function(){return this.shared.flags},set:function(val){this.shared.flags=val;}},position:{get:function(){return this.shared.position},set:function(val){this.shared.position=val;}}});}stream=Object.assign(new FS.FSStream,stream);var fd=FS.nextfd(fd_start,fd_end);stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream:fd=>{FS.streams[fd]=null;},chrdev_stream_ops:{open:stream=>{var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;if(stream.stream_ops.open){stream.stream_ops.open(stream);}},llseek:()=>{throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice:(dev,ops)=>{FS.devices[dev]={stream_ops:ops};},getDevice:dev=>FS.devices[dev],getMounts:mount=>{var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push.apply(check,m.mounts);}return mounts},syncfs:(populate,callback)=>{if(typeof populate=="function"){callback=populate;populate=false;}FS.syncFSRequests++;if(FS.syncFSRequests>1){err("warning: "+FS.syncFSRequests+" FS.syncfs operations in flight at once, probably just doing extra work");}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null);}}mounts.forEach(mount=>{if(!mount.type.syncfs){return done(null)}mount.type.syncfs(mount,populate,done);});},mount:(type,opts,mountpoint)=>{var root=mountpoint==="/";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type:type,opts:opts,mountpoint:mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot;}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount);}}return mountRoot},unmount:mountpoint=>{var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);Object.keys(FS.nameTable).forEach(hash=>{var current=FS.nameTable[hash];while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current);}current=next;}});node.mounted=null;var idx=node.mount.mounts.indexOf(mount);node.mount.mounts.splice(idx,1);},lookup:(parent,name)=>{return parent.node_ops.lookup(parent,name)},mknod:(path,mode,dev)=>{var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name||name==="."||name===".."){throw new FS.ErrnoError(28)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},create:(path,mode)=>{mode=mode!==undefined?mode:438;mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir:(path,mode)=>{mode=mode!==undefined?mode:511;mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree:(path,mode)=>{var dirs=path.split("/");var d="";for(var i=0;i<dirs.length;++i){if(!dirs[i])continue;d+="/"+dirs[i];try{FS.mkdir(d,mode);}catch(e){if(e.errno!=20)throw e}}},mkdev:(path,mode,dev)=>{if(typeof dev=="undefined"){dev=mode;mode=438;}mode|=8192;return FS.mknod(path,mode,dev)},symlink:(oldpath,newpath)=>{if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename:(old_path,new_path)=>{var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name);}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,"w");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);}catch(e){throw e}finally{FS.hashAddNode(old_node);}},rmdir:path=>{var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node);},readdir:path=>{var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;if(!node.node_ops.readdir){throw new FS.ErrnoError(54)}return node.node_ops.readdir(node)},unlink:path=>{var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node);},readlink:path=>{var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return PATH_FS.resolve(FS.getPath(link.parent),link.node_ops.readlink(link))},stat:(path,dontFollow)=>{var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;if(!node){throw new FS.ErrnoError(44)}if(!node.node_ops.getattr){throw new FS.ErrnoError(63)}return node.node_ops.getattr(node)},lstat:path=>{return FS.stat(path,true)},chmod:(path,mode,dontFollow)=>{var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node;}else {node=path;}if(!node.node_ops.setattr){throw new FS.ErrnoError(63)}node.node_ops.setattr(node,{mode:mode&4095|node.mode&~4095,timestamp:Date.now()});},lchmod:(path,mode)=>{FS.chmod(path,mode,true);},fchmod:(fd,mode)=>{var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}FS.chmod(stream.node,mode);},chown:(path,uid,gid,dontFollow)=>{var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node;}else {node=path;}if(!node.node_ops.setattr){throw new FS.ErrnoError(63)}node.node_ops.setattr(node,{timestamp:Date.now()});},lchown:(path,uid,gid)=>{FS.chown(path,uid,gid,true);},fchown:(fd,uid,gid)=>{var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}FS.chown(stream.node,uid,gid);},truncate:(path,len)=>{if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node;}else {node=path;}if(!node.node_ops.setattr){throw new FS.ErrnoError(63)}if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,"w");if(errCode){throw new FS.ErrnoError(errCode)}node.node_ops.setattr(node,{size:len,timestamp:Date.now()});},ftruncate:(fd,len)=>{var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.truncate(stream.node,len);},utime:(path,atime,mtime)=>{var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;node.node_ops.setattr(node,{timestamp:Math.max(atime,mtime)});},open:(path,flags,mode)=>{if(path===""){throw new FS.ErrnoError(44)}flags=typeof flags=="string"?FS.modeStringToFlags(flags):flags;mode=typeof mode=="undefined"?438:mode;if(flags&64){mode=mode&4095|32768;}else {mode=0;}var node;if(typeof path=="object"){node=path;}else {path=PATH.normalize(path);try{var lookup=FS.lookupPath(path,{follow:!(flags&131072)});node=lookup.node;}catch(e){}}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else {node=FS.mknod(path,mode,0);created=true;}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512;}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0);}flags&=~(128|512|131072);var stream=FS.createStream({node:node,path:FS.getPath(node),flags:flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream);}if(Module["logReadFiles"]&&!(flags&1)){if(!FS.readFiles)FS.readFiles={};if(!(path in FS.readFiles)){FS.readFiles[path]=1;}}return stream},close:stream=>{if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream);}}catch(e){throw e}finally{FS.closeStream(stream.fd);}stream.fd=null;},isClosed:stream=>{return stream.fd===null},llseek:(stream,offset,whence)=>{if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read:(stream,buffer,offset,length,position)=>{if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position;}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write:(stream,buffer,offset,length,position,canOwn)=>{if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2);}var seeking=typeof position!="undefined";if(!seeking){position=stream.position;}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},allocate:(stream,offset,length)=>{if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(offset<0||length<=0){throw new FS.ErrnoError(28)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(!FS.isFile(stream.node.mode)&&!FS.isDir(stream.node.mode)){throw new FS.ErrnoError(43)}if(!stream.stream_ops.allocate){throw new FS.ErrnoError(138)}stream.stream_ops.allocate(stream,offset,length);},mmap:(stream,length,position,prot,flags)=>{if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync:(stream,buffer,offset,length,mmapFlags)=>{if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},munmap:stream=>0,ioctl:(stream,cmd,arg)=>{if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile:(path,opts={})=>{opts.flags=opts.flags||0;opts.encoding=opts.encoding||"binary";if(opts.encoding!=="utf8"&&opts.encoding!=="binary"){throw new Error('Invalid encoding type "'+opts.encoding+'"')}var ret;var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding==="utf8"){ret=UTF8ArrayToString(buf,0);}else if(opts.encoding==="binary"){ret=buf;}FS.close(stream);return ret},writeFile:(path,data,opts={})=>{opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);if(typeof data=="string"){var buf=new Uint8Array(lengthBytesUTF8(data)+1);var actualNumBytes=stringToUTF8Array(data,buf,0,buf.length);FS.write(stream,buf,0,actualNumBytes,undefined,opts.canOwn);}else if(ArrayBuffer.isView(data)){FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn);}else {throw new Error("Unsupported data type")}FS.close(stream);},cwd:()=>FS.currentPath,chdir:path=>{var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,"x");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path;},createDefaultDirectories:()=>{FS.mkdir("/tmp");FS.mkdir("/home");FS.mkdir("/home/web_user");},createDefaultDevices:()=>{FS.mkdir("/dev");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length});FS.mkdev("/dev/null",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev("/dev/tty",FS.makedev(5,0));FS.mkdev("/dev/tty1",FS.makedev(6,0));var random_device=getRandomDevice();FS.createDevice("/dev","random",random_device);FS.createDevice("/dev","urandom",random_device);FS.mkdir("/dev/shm");FS.mkdir("/dev/shm/tmp");},createSpecialDirectories:()=>{FS.mkdir("/proc");var proc_self=FS.mkdir("/proc/self");FS.mkdir("/proc/self/fd");FS.mount({mount:()=>{var node=FS.createNode(proc_self,"fd",16384|511,73);node.node_ops={lookup:(parent,name)=>{var fd=+name;var stream=FS.getStream(fd);if(!stream)throw new FS.ErrnoError(8);var ret={parent:null,mount:{mountpoint:"fake"},node_ops:{readlink:()=>stream.path}};ret.parent=ret;return ret}};return node}},{},"/proc/self/fd");},createStandardStreams:()=>{if(Module["stdin"]){FS.createDevice("/dev","stdin",Module["stdin"]);}else {FS.symlink("/dev/tty","/dev/stdin");}if(Module["stdout"]){FS.createDevice("/dev","stdout",null,Module["stdout"]);}else {FS.symlink("/dev/tty","/dev/stdout");}if(Module["stderr"]){FS.createDevice("/dev","stderr",null,Module["stderr"]);}else {FS.symlink("/dev/tty1","/dev/stderr");}FS.open("/dev/stdin",0);FS.open("/dev/stdout",1);FS.open("/dev/stderr",1);},ensureErrnoError:()=>{if(FS.ErrnoError)return;FS.ErrnoError=function ErrnoError(errno,node){this.node=node;this.setErrno=function(errno){this.errno=errno;};this.setErrno(errno);this.message="FS error";};FS.ErrnoError.prototype=new Error;FS.ErrnoError.prototype.constructor=FS.ErrnoError;[44].forEach(code=>{FS.genericErrors[code]=new FS.ErrnoError(code);FS.genericErrors[code].stack="<generic error, no stack>";});},staticInit:()=>{FS.ensureErrnoError();FS.nameTable=new Array(4096);FS.mount(MEMFS,{},"/");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={"MEMFS":MEMFS};},init:(input,output,error)=>{FS.init.initialized=true;FS.ensureErrnoError();Module["stdin"]=input||Module["stdin"];Module["stdout"]=output||Module["stdout"];Module["stderr"]=error||Module["stderr"];FS.createStandardStreams();},quit:()=>{FS.init.initialized=false;for(var i=0;i<FS.streams.length;i++){var stream=FS.streams[i];if(!stream){continue}FS.close(stream);}},getMode:(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode},findObject:(path,dontResolveLastLink)=>{var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath:(path,dontResolveLastLink)=>{try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path;}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path==="/";}catch(e){ret.error=e.errno;}return ret},createPath:(parent,path,canRead,canWrite)=>{parent=typeof parent=="string"?parent:FS.getPath(parent);var parts=path.split("/").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current);}catch(e){}parent=current;}return current},createFile:(parent,name,properties,canRead,canWrite)=>{var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS.getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile:(parent,name,data,canRead,canWrite,canOwn)=>{var path=name;if(parent){parent=typeof parent=="string"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent;}var mode=FS.getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){if(typeof data=="string"){var arr=new Array(data.length);for(var i=0,len=data.length;i<len;++i)arr[i]=data.charCodeAt(i);data=arr;}FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode);}return node},createDevice:(parent,name,input,output)=>{var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS.getMode(!!input,!!output);if(!FS.createDevice.major)FS.createDevice.major=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open:stream=>{stream.seekable=false;},close:stream=>{if(output&&output.buffer&&output.buffer.length){output(10);}},read:(stream,buffer,offset,length,pos)=>{var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input();}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result;}if(bytesRead){stream.node.timestamp=Date.now();}return bytesRead},write:(stream,buffer,offset,length,pos)=>{for(var i=0;i<length;i++){try{output(buffer[offset+i]);}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.timestamp=Date.now();}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile:obj=>{if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(typeof XMLHttpRequest!="undefined"){throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")}else if(read_){try{obj.contents=intArrayFromString(read_(obj.url),true);obj.usedBytes=obj.contents.length;}catch(e){throw new FS.ErrnoError(29)}}else {throw new Error("Cannot load without read() or XMLHttpRequest.")}},createLazyFile:(parent,name,url,canRead,canWrite)=>{function LazyUint8Array(){this.lengthKnown=false;this.chunks=[];}LazyUint8Array.prototype.get=function LazyUint8Array_get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]};LazyUint8Array.prototype.setDataGetter=function LazyUint8Array_setDataGetter(getter){this.getter=getter;};LazyUint8Array.prototype.cacheLength=function LazyUint8Array_cacheLength(){var xhr=new XMLHttpRequest;xhr.open("HEAD",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))throw new Error("Couldn't load "+url+". Status: "+xhr.status);var datalength=Number(xhr.getResponseHeader("Content-length"));var header;var hasByteServing=(header=xhr.getResponseHeader("Accept-Ranges"))&&header==="bytes";var usesGzip=(header=xhr.getResponseHeader("Content-Encoding"))&&header==="gzip";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)throw new Error("invalid range ("+from+", "+to+") or no bytes requested!");if(to>datalength-1)throw new Error("only "+datalength+" bytes available! programmer error!");var xhr=new XMLHttpRequest;xhr.open("GET",url,false);if(datalength!==chunkSize)xhr.setRequestHeader("Range","bytes="+from+"-"+to);xhr.responseType="arraybuffer";if(xhr.overrideMimeType){xhr.overrideMimeType("text/plain; charset=x-user-defined");}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))throw new Error("Couldn't load "+url+". Status: "+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||"",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]=="undefined"){lazyArray.chunks[chunkNum]=doXHR(start,end);}if(typeof lazyArray.chunks[chunkNum]=="undefined")throw new Error("doXHR failed!");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out("LazyFiles on gzip forces download of the whole file when length is accessed");}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true;};if(typeof XMLHttpRequest!="undefined"){if(!ENVIRONMENT_IS_WORKER)throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";var lazyArray=new LazyUint8Array;Object.defineProperties(lazyArray,{length:{get:function(){if(!this.lengthKnown){this.cacheLength();}return this._length}},chunkSize:{get:function(){if(!this.lengthKnown){this.cacheLength();}return this._chunkSize}}});var properties={isDevice:false,contents:lazyArray};}else {var properties={isDevice:false,url:url};}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents;}else if(properties.url){node.contents=null;node.url=properties.url;}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};var keys=Object.keys(node.stream_ops);keys.forEach(key=>{var fn=node.stream_ops[key];stream_ops[key]=function forceLoadLazyFile(){FS.forceLoadFile(node);return fn.apply(null,arguments)};});function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i];}}else {for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i);}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,GROWABLE_HEAP_I8(),ptr,length,position);return {ptr:ptr,allocated:true}};node.stream_ops=stream_ops;return node},createPreloadedFile:(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;function processData(byteArray){function finish(byteArray){if(preFinish)preFinish();if(!dontCreateFile){FS.createDataFile(parent,name,byteArray,canRead,canWrite,canOwn);}if(onload)onload();removeRunDependency();}if(Browser.handledByPreloadPlugin(byteArray,fullname,finish,()=>{if(onerror)onerror();removeRunDependency();})){return}finish(byteArray);}addRunDependency();if(typeof url=="string"){asyncLoad(url,byteArray=>processData(byteArray),onerror);}else {processData(url);}},indexedDB:()=>{return window.indexedDB||window.mozIndexedDB||window.webkitIndexedDB||window.msIndexedDB},DB_NAME:()=>{return "EM_FS_"+window.location.pathname},DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:(paths,onload,onerror)=>{onload=onload||(()=>{});onerror=onerror||(()=>{});var indexedDB=FS.indexedDB();try{var openRequest=indexedDB.open(FS.DB_NAME(),FS.DB_VERSION);}catch(e){return onerror(e)}openRequest.onupgradeneeded=()=>{out("creating db");var db=openRequest.result;db.createObjectStore(FS.DB_STORE_NAME);};openRequest.onsuccess=()=>{var db=openRequest.result;var transaction=db.transaction([FS.DB_STORE_NAME],"readwrite");var files=transaction.objectStore(FS.DB_STORE_NAME);var ok=0,fail=0,total=paths.length;function finish(){if(fail==0)onload();else onerror();}paths.forEach(path=>{var putRequest=files.put(FS.analyzePath(path).object.contents,path);putRequest.onsuccess=()=>{ok++;if(ok+fail==total)finish();};putRequest.onerror=()=>{fail++;if(ok+fail==total)finish();};});transaction.onerror=onerror;};openRequest.onerror=onerror;},loadFilesFromDB:(paths,onload,onerror)=>{onload=onload||(()=>{});onerror=onerror||(()=>{});var indexedDB=FS.indexedDB();try{var openRequest=indexedDB.open(FS.DB_NAME(),FS.DB_VERSION);}catch(e){return onerror(e)}openRequest.onupgradeneeded=onerror;openRequest.onsuccess=()=>{var db=openRequest.result;try{var transaction=db.transaction([FS.DB_STORE_NAME],"readonly");}catch(e){onerror(e);return}var files=transaction.objectStore(FS.DB_STORE_NAME);var ok=0,fail=0,total=paths.length;function finish(){if(fail==0)onload();else onerror();}paths.forEach(path=>{var getRequest=files.get(path);getRequest.onsuccess=()=>{if(FS.analyzePath(path).exists){FS.unlink(path);}FS.createDataFile(PATH.dirname(path),PATH.basename(path),getRequest.result,true,true,true);ok++;if(ok+fail==total)finish();};getRequest.onerror=()=>{fail++;if(ok+fail==total)finish();};});transaction.onerror=onerror;};openRequest.onerror=onerror;}};var SYSCALLS={DEFAULT_POLLMASK:5,calculateAt:function(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd();}else {var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path;}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return PATH.join2(dir,path)},doStat:function(func,path,buf){try{var stat=func(path);}catch(e){if(e&&e.node&&PATH.normalize(path)!==PATH.normalize(FS.getPath(e.node))){return -54}throw e}GROWABLE_HEAP_I32()[buf>>2]=stat.dev;GROWABLE_HEAP_I32()[buf+8>>2]=stat.ino;GROWABLE_HEAP_I32()[buf+12>>2]=stat.mode;GROWABLE_HEAP_U32()[buf+16>>2]=stat.nlink;GROWABLE_HEAP_I32()[buf+20>>2]=stat.uid;GROWABLE_HEAP_I32()[buf+24>>2]=stat.gid;GROWABLE_HEAP_I32()[buf+28>>2]=stat.rdev;tempI64=[stat.size>>>0,(tempDouble=stat.size,+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[buf+40>>2]=tempI64[0],GROWABLE_HEAP_I32()[buf+44>>2]=tempI64[1];GROWABLE_HEAP_I32()[buf+48>>2]=4096;GROWABLE_HEAP_I32()[buf+52>>2]=stat.blocks;tempI64=[Math.floor(stat.atime.getTime()/1e3)>>>0,(tempDouble=Math.floor(stat.atime.getTime()/1e3),+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[buf+56>>2]=tempI64[0],GROWABLE_HEAP_I32()[buf+60>>2]=tempI64[1];GROWABLE_HEAP_U32()[buf+64>>2]=0;tempI64=[Math.floor(stat.mtime.getTime()/1e3)>>>0,(tempDouble=Math.floor(stat.mtime.getTime()/1e3),+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[buf+72>>2]=tempI64[0],GROWABLE_HEAP_I32()[buf+76>>2]=tempI64[1];GROWABLE_HEAP_U32()[buf+80>>2]=0;tempI64=[Math.floor(stat.ctime.getTime()/1e3)>>>0,(tempDouble=Math.floor(stat.ctime.getTime()/1e3),+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[buf+88>>2]=tempI64[0],GROWABLE_HEAP_I32()[buf+92>>2]=tempI64[1];GROWABLE_HEAP_U32()[buf+96>>2]=0;tempI64=[stat.ino>>>0,(tempDouble=stat.ino,+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[buf+104>>2]=tempI64[0],GROWABLE_HEAP_I32()[buf+108>>2]=tempI64[1];return 0},doMsync:function(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=GROWABLE_HEAP_U8().slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags);},varargs:undefined,get:function(){SYSCALLS.varargs+=4;var ret=GROWABLE_HEAP_I32()[SYSCALLS.varargs-4>>2];return ret},getStr:function(ptr){var ret=UTF8ToString(ptr);return ret},getStreamFromFD:function(fd){var stream=FS.getStream(fd);if(!stream)throw new FS.ErrnoError(8);return stream}};function _proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(1,1,code);EXITSTATUS=code;if(!keepRuntimeAlive()){PThread.terminateAllThreads();if(Module["onExit"])Module["onExit"](code);ABORT=true;}quit_(code,new ExitStatus(code));}function exitJS(status,implicit){EXITSTATUS=status;if(!implicit){if(ENVIRONMENT_IS_PTHREAD){exitOnMainThread(status);throw "unwind"}}_proc_exit(status);}var _exit=exitJS;function handleException(e){if(e instanceof ExitStatus||e=="unwind"){return EXITSTATUS}quit_(1,e);}function maybeExit(){}function setMainLoop(browserIterationFunc,fps,simulateInfiniteLoop,arg,noSetTiming){assert(!Browser.mainLoop.func,"emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.");Browser.mainLoop.func=browserIterationFunc;Browser.mainLoop.arg=arg;var thisMainLoopId=Browser.mainLoop.currentlyRunningMainloop;function checkIsRunning(){if(thisMainLoopId<Browser.mainLoop.currentlyRunningMainloop){return false}return true}Browser.mainLoop.running=false;Browser.mainLoop.runner=function Browser_mainLoop_runner(){if(ABORT)return;if(Browser.mainLoop.queue.length>0){var start=Date.now();var blocker=Browser.mainLoop.queue.shift();blocker.func(blocker.arg);if(Browser.mainLoop.remainingBlockers){var remaining=Browser.mainLoop.remainingBlockers;var next=remaining%1==0?remaining-1:Math.floor(remaining);if(blocker.counted){Browser.mainLoop.remainingBlockers=next;}else {next=next+.5;Browser.mainLoop.remainingBlockers=(8*remaining+next)/9;}}out('main loop blocker "'+blocker.name+'" took '+(Date.now()-start)+" ms");Browser.mainLoop.updateStatus();if(!checkIsRunning())return;setTimeout(Browser.mainLoop.runner,0);return}if(!checkIsRunning())return;Browser.mainLoop.currentFrameNumber=Browser.mainLoop.currentFrameNumber+1|0;if(Browser.mainLoop.timingMode==1&&Browser.mainLoop.timingValue>1&&Browser.mainLoop.currentFrameNumber%Browser.mainLoop.timingValue!=0){Browser.mainLoop.scheduler();return}else if(Browser.mainLoop.timingMode==0){Browser.mainLoop.tickStartTime=_emscripten_get_now();}Browser.mainLoop.runIter(browserIterationFunc);if(!checkIsRunning())return;if(typeof SDL=="object"&&SDL.audio&&SDL.audio.queueNewAudioData)SDL.audio.queueNewAudioData();Browser.mainLoop.scheduler();};if(!noSetTiming){if(fps&&fps>0)_emscripten_set_main_loop_timing(0,1e3/fps);else _emscripten_set_main_loop_timing(1,1);Browser.mainLoop.scheduler();}if(simulateInfiniteLoop){throw "unwind"}}function callUserCallback(func){if(ABORT){return}try{func();if(ENVIRONMENT_IS_PTHREAD)maybeExit();}catch(e){handleException(e);}}function safeSetTimeout(func,timeout){return setTimeout(function(){callUserCallback(func);},timeout)}function warnOnce(text){if(!warnOnce.shown)warnOnce.shown={};if(!warnOnce.shown[text]){warnOnce.shown[text]=1;if(ENVIRONMENT_IS_NODE)text="warning: "+text;err(text);}}var Browser={mainLoop:{running:false,scheduler:null,method:"",currentlyRunningMainloop:0,func:null,arg:0,timingMode:0,timingValue:0,currentFrameNumber:0,queue:[],pause:function(){Browser.mainLoop.scheduler=null;Browser.mainLoop.currentlyRunningMainloop++;},resume:function(){Browser.mainLoop.currentlyRunningMainloop++;var timingMode=Browser.mainLoop.timingMode;var timingValue=Browser.mainLoop.timingValue;var func=Browser.mainLoop.func;Browser.mainLoop.func=null;setMainLoop(func,0,false,Browser.mainLoop.arg,true);_emscripten_set_main_loop_timing(timingMode,timingValue);Browser.mainLoop.scheduler();},updateStatus:function(){if(Module["setStatus"]){var message=Module["statusMessage"]||"Please wait...";var remaining=Browser.mainLoop.remainingBlockers;var expected=Browser.mainLoop.expectedBlockers;if(remaining){if(remaining<expected){Module["setStatus"](message+" ("+(expected-remaining)+"/"+expected+")");}else {Module["setStatus"](message);}}else {Module["setStatus"]("");}}},runIter:function(func){if(ABORT)return;if(Module["preMainLoop"]){var preRet=Module["preMainLoop"]();if(preRet===false){return}}callUserCallback(func);if(Module["postMainLoop"])Module["postMainLoop"]();}},isFullscreen:false,pointerLock:false,moduleContextCreatedCallbacks:[],workers:[],init:function(){if(!Module["preloadPlugins"])Module["preloadPlugins"]=[];if(Browser.initted)return;Browser.initted=true;try{new Blob;Browser.hasBlobConstructor=true;}catch(e){Browser.hasBlobConstructor=false;err("warning: no blob constructor, cannot create blobs with mimetypes");}Browser.BlobBuilder=typeof MozBlobBuilder!="undefined"?MozBlobBuilder:typeof WebKitBlobBuilder!="undefined"?WebKitBlobBuilder:!Browser.hasBlobConstructor?err("warning: no BlobBuilder"):null;Browser.URLObject=typeof window!="undefined"?window.URL?window.URL:window.webkitURL:undefined;if(!Module.noImageDecoding&&typeof Browser.URLObject=="undefined"){err("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");Module.noImageDecoding=true;}var imagePlugin={};imagePlugin["canHandle"]=function imagePlugin_canHandle(name){return !Module.noImageDecoding&&/\.(jpg|jpeg|png|bmp)$/i.test(name)};imagePlugin["handle"]=function imagePlugin_handle(byteArray,name,onload,onerror){var b=null;if(Browser.hasBlobConstructor){try{b=new Blob([byteArray],{type:Browser.getMimetype(name)});if(b.size!==byteArray.length){b=new Blob([new Uint8Array(byteArray).buffer],{type:Browser.getMimetype(name)});}}catch(e){warnOnce("Blob constructor present but fails: "+e+"; falling back to blob builder");}}if(!b){var bb=new Browser.BlobBuilder;bb.append(new Uint8Array(byteArray).buffer);b=bb.getBlob();}var url=Browser.URLObject.createObjectURL(b);var img=new Image;img.onload=()=>{assert(img.complete,"Image "+name+" could not be decoded");var canvas=document.createElement("canvas");canvas.width=img.width;canvas.height=img.height;var ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);Browser.URLObject.revokeObjectURL(url);if(onload)onload(byteArray);};img.onerror=event=>{out("Image "+url+" could not be decoded");if(onerror)onerror();};img.src=url;};Module["preloadPlugins"].push(imagePlugin);var audioPlugin={};audioPlugin["canHandle"]=function audioPlugin_canHandle(name){return !Module.noAudioDecoding&&name.substr(-4)in{".ogg":1,".wav":1,".mp3":1}};audioPlugin["handle"]=function audioPlugin_handle(byteArray,name,onload,onerror){var done=false;function finish(audio){if(done)return;done=true;if(onload)onload(byteArray);}function fail(){if(done)return;done=true;new Audio;if(onerror)onerror();}if(Browser.hasBlobConstructor){try{var b=new Blob([byteArray],{type:Browser.getMimetype(name)});}catch(e){return fail()}var url=Browser.URLObject.createObjectURL(b);var audio=new Audio;audio.addEventListener("canplaythrough",()=>finish(),false);audio.onerror=function audio_onerror(event){if(done)return;err("warning: browser could not fully decode audio "+name+", trying slower base64 approach");function encode64(data){var BASE="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";var PAD="=";var ret="";var leftchar=0;var leftbits=0;for(var i=0;i<data.length;i++){leftchar=leftchar<<8|data[i];leftbits+=8;while(leftbits>=6){var curr=leftchar>>leftbits-6&63;leftbits-=6;ret+=BASE[curr];}}if(leftbits==2){ret+=BASE[(leftchar&3)<<4];ret+=PAD+PAD;}else if(leftbits==4){ret+=BASE[(leftchar&15)<<2];ret+=PAD;}return ret}audio.src="data:audio/x-"+name.substr(-3)+";base64,"+encode64(byteArray);finish();};audio.src=url;safeSetTimeout(function(){finish();},1e4);}else {return fail()}};Module["preloadPlugins"].push(audioPlugin);function pointerLockChange(){Browser.pointerLock=document["pointerLockElement"]===Module["canvas"]||document["mozPointerLockElement"]===Module["canvas"]||document["webkitPointerLockElement"]===Module["canvas"]||document["msPointerLockElement"]===Module["canvas"];}var canvas=Module["canvas"];if(canvas){canvas.requestPointerLock=canvas["requestPointerLock"]||canvas["mozRequestPointerLock"]||canvas["webkitRequestPointerLock"]||canvas["msRequestPointerLock"]||(()=>{});canvas.exitPointerLock=document["exitPointerLock"]||document["mozExitPointerLock"]||document["webkitExitPointerLock"]||document["msExitPointerLock"]||(()=>{});canvas.exitPointerLock=canvas.exitPointerLock.bind(document);document.addEventListener("pointerlockchange",pointerLockChange,false);document.addEventListener("mozpointerlockchange",pointerLockChange,false);document.addEventListener("webkitpointerlockchange",pointerLockChange,false);document.addEventListener("mspointerlockchange",pointerLockChange,false);if(Module["elementPointerLock"]){canvas.addEventListener("click",ev=>{if(!Browser.pointerLock&&Module["canvas"].requestPointerLock){Module["canvas"].requestPointerLock();ev.preventDefault();}},false);}}},handledByPreloadPlugin:function(byteArray,fullname,finish,onerror){Browser.init();var handled=false;Module["preloadPlugins"].forEach(function(plugin){if(handled)return;if(plugin["canHandle"](fullname)){plugin["handle"](byteArray,fullname,finish,onerror);handled=true;}});return handled},createContext:function(canvas,useWebGL,setInModule,webGLContextAttributes){if(useWebGL&&Module.ctx&&canvas==Module.canvas)return Module.ctx;var ctx;var contextHandle;if(useWebGL){var contextAttributes={antialias:false,alpha:false,majorVersion:1};if(webGLContextAttributes){for(var attribute in webGLContextAttributes){contextAttributes[attribute]=webGLContextAttributes[attribute];}}if(typeof GL!="undefined"){contextHandle=GL.createContext(canvas,contextAttributes);if(contextHandle){ctx=GL.getContext(contextHandle).GLctx;}}}else {ctx=canvas.getContext("2d");}if(!ctx)return null;if(setInModule){if(!useWebGL)assert(typeof GLctx=="undefined","cannot set in module if GLctx is used, but we are a non-GL context that would replace it");Module.ctx=ctx;if(useWebGL)GL.makeContextCurrent(contextHandle);Module.useWebGL=useWebGL;Browser.moduleContextCreatedCallbacks.forEach(function(callback){callback();});Browser.init();}return ctx},destroyContext:function(canvas,useWebGL,setInModule){},fullscreenHandlersInstalled:false,lockPointer:undefined,resizeCanvas:undefined,requestFullscreen:function(lockPointer,resizeCanvas){Browser.lockPointer=lockPointer;Browser.resizeCanvas=resizeCanvas;if(typeof Browser.lockPointer=="undefined")Browser.lockPointer=true;if(typeof Browser.resizeCanvas=="undefined")Browser.resizeCanvas=false;var canvas=Module["canvas"];function fullscreenChange(){Browser.isFullscreen=false;var canvasContainer=canvas.parentNode;if((document["fullscreenElement"]||document["mozFullScreenElement"]||document["msFullscreenElement"]||document["webkitFullscreenElement"]||document["webkitCurrentFullScreenElement"])===canvasContainer){canvas.exitFullscreen=Browser.exitFullscreen;if(Browser.lockPointer)canvas.requestPointerLock();Browser.isFullscreen=true;if(Browser.resizeCanvas){Browser.setFullscreenCanvasSize();}else {Browser.updateCanvasDimensions(canvas);}}else {canvasContainer.parentNode.insertBefore(canvas,canvasContainer);canvasContainer.parentNode.removeChild(canvasContainer);if(Browser.resizeCanvas){Browser.setWindowedCanvasSize();}else {Browser.updateCanvasDimensions(canvas);}}if(Module["onFullScreen"])Module["onFullScreen"](Browser.isFullscreen);if(Module["onFullscreen"])Module["onFullscreen"](Browser.isFullscreen);}if(!Browser.fullscreenHandlersInstalled){Browser.fullscreenHandlersInstalled=true;document.addEventListener("fullscreenchange",fullscreenChange,false);document.addEventListener("mozfullscreenchange",fullscreenChange,false);document.addEventListener("webkitfullscreenchange",fullscreenChange,false);document.addEventListener("MSFullscreenChange",fullscreenChange,false);}var canvasContainer=document.createElement("div");canvas.parentNode.insertBefore(canvasContainer,canvas);canvasContainer.appendChild(canvas);canvasContainer.requestFullscreen=canvasContainer["requestFullscreen"]||canvasContainer["mozRequestFullScreen"]||canvasContainer["msRequestFullscreen"]||(canvasContainer["webkitRequestFullscreen"]?()=>canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"]):null)||(canvasContainer["webkitRequestFullScreen"]?()=>canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]):null);canvasContainer.requestFullscreen();},exitFullscreen:function(){if(!Browser.isFullscreen){return false}var CFS=document["exitFullscreen"]||document["cancelFullScreen"]||document["mozCancelFullScreen"]||document["msExitFullscreen"]||document["webkitCancelFullScreen"]||function(){};CFS.apply(document,[]);return true},nextRAF:0,fakeRequestAnimationFrame:function(func){var now=Date.now();if(Browser.nextRAF===0){Browser.nextRAF=now+1e3/60;}else {while(now+2>=Browser.nextRAF){Browser.nextRAF+=1e3/60;}}var delay=Math.max(Browser.nextRAF-now,0);setTimeout(func,delay);},requestAnimationFrame:function(func){if(typeof requestAnimationFrame=="function"){requestAnimationFrame(func);return}var RAF=Browser.fakeRequestAnimationFrame;RAF(func);},safeSetTimeout:function(func,timeout){return safeSetTimeout(func,timeout)},safeRequestAnimationFrame:function(func){return Browser.requestAnimationFrame(function(){callUserCallback(func);})},getMimetype:function(name){return {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","bmp":"image/bmp","ogg":"audio/ogg","wav":"audio/wav","mp3":"audio/mpeg"}[name.substr(name.lastIndexOf(".")+1)]},getUserMedia:function(func){if(!window.getUserMedia){window.getUserMedia=navigator["getUserMedia"]||navigator["mozGetUserMedia"];}window.getUserMedia(func);},getMovementX:function(event){return event["movementX"]||event["mozMovementX"]||event["webkitMovementX"]||0},getMovementY:function(event){return event["movementY"]||event["mozMovementY"]||event["webkitMovementY"]||0},getMouseWheelDelta:function(event){var delta=0;switch(event.type){case"DOMMouseScroll":delta=event.detail/3;break;case"mousewheel":delta=event.wheelDelta/120;break;case"wheel":delta=event.deltaY;switch(event.deltaMode){case 0:delta/=100;break;case 1:delta/=3;break;case 2:delta*=80;break;default:throw "unrecognized mouse wheel delta mode: "+event.deltaMode}break;default:throw "unrecognized mouse wheel event: "+event.type}return delta},mouseX:0,mouseY:0,mouseMovementX:0,mouseMovementY:0,touches:{},lastTouches:{},calculateMouseEvent:function(event){if(Browser.pointerLock){if(event.type!="mousemove"&&"mozMovementX"in event){Browser.mouseMovementX=Browser.mouseMovementY=0;}else {Browser.mouseMovementX=Browser.getMovementX(event);Browser.mouseMovementY=Browser.getMovementY(event);}if(typeof SDL!="undefined"){Browser.mouseX=SDL.mouseX+Browser.mouseMovementX;Browser.mouseY=SDL.mouseY+Browser.mouseMovementY;}else {Browser.mouseX+=Browser.mouseMovementX;Browser.mouseY+=Browser.mouseMovementY;}}else {var rect=Module["canvas"].getBoundingClientRect();var cw=Module["canvas"].width;var ch=Module["canvas"].height;var scrollX=typeof window.scrollX!="undefined"?window.scrollX:window.pageXOffset;var scrollY=typeof window.scrollY!="undefined"?window.scrollY:window.pageYOffset;if(event.type==="touchstart"||event.type==="touchend"||event.type==="touchmove"){var touch=event.touch;if(touch===undefined){return}var adjustedX=touch.pageX-(scrollX+rect.left);var adjustedY=touch.pageY-(scrollY+rect.top);adjustedX=adjustedX*(cw/rect.width);adjustedY=adjustedY*(ch/rect.height);var coords={x:adjustedX,y:adjustedY};if(event.type==="touchstart"){Browser.lastTouches[touch.identifier]=coords;Browser.touches[touch.identifier]=coords;}else if(event.type==="touchend"||event.type==="touchmove"){var last=Browser.touches[touch.identifier];if(!last)last=coords;Browser.lastTouches[touch.identifier]=last;Browser.touches[touch.identifier]=coords;}return}var x=event.pageX-(scrollX+rect.left);var y=event.pageY-(scrollY+rect.top);x=x*(cw/rect.width);y=y*(ch/rect.height);Browser.mouseMovementX=x-Browser.mouseX;Browser.mouseMovementY=y-Browser.mouseY;Browser.mouseX=x;Browser.mouseY=y;}},resizeListeners:[],updateResizeListeners:function(){var canvas=Module["canvas"];Browser.resizeListeners.forEach(function(listener){listener(canvas.width,canvas.height);});},setCanvasSize:function(width,height,noUpdates){var canvas=Module["canvas"];Browser.updateCanvasDimensions(canvas,width,height);if(!noUpdates)Browser.updateResizeListeners();},windowedWidth:0,windowedHeight:0,setFullscreenCanvasSize:function(){if(typeof SDL!="undefined"){var flags=GROWABLE_HEAP_U32()[SDL.screen>>2];flags=flags|8388608;GROWABLE_HEAP_I32()[SDL.screen>>2]=flags;}Browser.updateCanvasDimensions(Module["canvas"]);Browser.updateResizeListeners();},setWindowedCanvasSize:function(){if(typeof SDL!="undefined"){var flags=GROWABLE_HEAP_U32()[SDL.screen>>2];flags=flags&~8388608;GROWABLE_HEAP_I32()[SDL.screen>>2]=flags;}Browser.updateCanvasDimensions(Module["canvas"]);Browser.updateResizeListeners();},updateCanvasDimensions:function(canvas,wNative,hNative){if(wNative&&hNative){canvas.widthNative=wNative;canvas.heightNative=hNative;}else {wNative=canvas.widthNative;hNative=canvas.heightNative;}var w=wNative;var h=hNative;if(Module["forcedAspectRatio"]&&Module["forcedAspectRatio"]>0){if(w/h<Module["forcedAspectRatio"]){w=Math.round(h*Module["forcedAspectRatio"]);}else {h=Math.round(w/Module["forcedAspectRatio"]);}}if((document["fullscreenElement"]||document["mozFullScreenElement"]||document["msFullscreenElement"]||document["webkitFullscreenElement"]||document["webkitCurrentFullScreenElement"])===canvas.parentNode&&typeof screen!="undefined"){var factor=Math.min(screen.width/w,screen.height/h);w=Math.round(w*factor);h=Math.round(h*factor);}if(Browser.resizeCanvas){if(canvas.width!=w)canvas.width=w;if(canvas.height!=h)canvas.height=h;if(typeof canvas.style!="undefined"){canvas.style.removeProperty("width");canvas.style.removeProperty("height");}}else {if(canvas.width!=wNative)canvas.width=wNative;if(canvas.height!=hNative)canvas.height=hNative;if(typeof canvas.style!="undefined"){if(w!=wNative||h!=hNative){canvas.style.setProperty("width",w+"px","important");canvas.style.setProperty("height",h+"px","important");}else {canvas.style.removeProperty("width");canvas.style.removeProperty("height");}}}}};function killThread(pthread_ptr){var worker=PThread.pthreads[pthread_ptr];delete PThread.pthreads[pthread_ptr];worker.terminate();__emscripten_thread_free_data(pthread_ptr);PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker),1);worker.pthread_ptr=0;}function cancelThread(pthread_ptr){var worker=PThread.pthreads[pthread_ptr];worker.postMessage({"cmd":"cancel"});}function cleanupThread(pthread_ptr){var worker=PThread.pthreads[pthread_ptr];assert(worker);PThread.returnWorkerToPool(worker);}function spawnThread(threadParams){var worker=PThread.getNewWorker();if(!worker){return 6}PThread.runningWorkers.push(worker);PThread.pthreads[threadParams.pthread_ptr]=worker;worker.pthread_ptr=threadParams.pthread_ptr;var msg={"cmd":"run","start_routine":threadParams.startRoutine,"arg":threadParams.arg,"pthread_ptr":threadParams.pthread_ptr};worker.runPthread=()=>{msg.time=performance.now();worker.postMessage(msg,threadParams.transferList);};if(worker.loaded){worker.runPthread();delete worker.runPthread;}return 0}var PThread={unusedWorkers:[],runningWorkers:[],tlsInitFunctions:[],pthreads:{},init:function(){if(ENVIRONMENT_IS_PTHREAD){PThread.initWorker();}else {PThread.initMainThread();}},initMainThread:function(){},initWorker:function(){noExitRuntime=false;},setExitStatus:function(status){EXITSTATUS=status;},terminateAllThreads:function(){for(var worker of Object.values(PThread.pthreads)){PThread.returnWorkerToPool(worker);}for(var worker of PThread.unusedWorkers){worker.terminate();}PThread.unusedWorkers=[];},returnWorkerToPool:function(worker){var pthread_ptr=worker.pthread_ptr;delete PThread.pthreads[pthread_ptr];PThread.unusedWorkers.push(worker);PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker),1);worker.pthread_ptr=0;__emscripten_thread_free_data(pthread_ptr);},receiveObjectTransfer:function(data){},threadInitTLS:function(){PThread.tlsInitFunctions.forEach(f=>f());},loadWasmModuleToWorker:function(worker,onFinishedLoading){worker.onmessage=e=>{var d=e["data"];var cmd=d["cmd"];if(worker.pthread_ptr)PThread.currentProxiedOperationCallerThread=worker.pthread_ptr;if(d["targetThread"]&&d["targetThread"]!=_pthread_self()){var targetWorker=PThread.pthreads[d.targetThread];if(targetWorker){targetWorker.postMessage(d,d["transferList"]);}else {err('Internal error! Worker sent a message "'+cmd+'" to target pthread '+d["targetThread"]+", but that thread no longer exists!");}PThread.currentProxiedOperationCallerThread=undefined;return}if(cmd==="processProxyingQueue"){executeNotifiedProxyingQueue(d["queue"]);}else if(cmd==="spawnThread"){spawnThread(d);}else if(cmd==="cleanupThread"){cleanupThread(d["thread"]);}else if(cmd==="killThread"){killThread(d["thread"]);}else if(cmd==="cancelThread"){cancelThread(d["thread"]);}else if(cmd==="loaded"){worker.loaded=true;if(onFinishedLoading)onFinishedLoading(worker);if(worker.runPthread){worker.runPthread();delete worker.runPthread;}}else if(cmd==="print"){out("Thread "+d["threadId"]+": "+d["text"]);}else if(cmd==="printErr"){err("Thread "+d["threadId"]+": "+d["text"]);}else if(cmd==="alert"){alert("Thread "+d["threadId"]+": "+d["text"]);}else if(d.target==="setimmediate"){worker.postMessage(d);}else if(cmd==="callHandler"){Module[d["handler"]](...d["args"]);}else if(cmd){err("worker sent an unknown command "+cmd);}PThread.currentProxiedOperationCallerThread=undefined;};worker.onerror=e=>{var message="worker sent an error!";err(message+" "+e.filename+":"+e.lineno+": "+e.message);throw e};if(ENVIRONMENT_IS_NODE){worker.on("message",function(data){worker.onmessage({data:data});});worker.on("error",function(e){worker.onerror(e);});worker.on("detachedExit",function(){});}var handlers=[];var knownHandlers=["onExit","onAbort","print","printErr"];for(var handler of knownHandlers){if(Module.hasOwnProperty(handler)){handlers.push(handler);}}worker.postMessage({"cmd":"load","handlers":handlers,"urlOrBlob":Module["mainScriptUrlOrBlob"],"wasmMemory":wasmMemory,"wasmModule":wasmModule});},allocateUnusedWorker:function(){if(!Module["locateFile"]){PThread.unusedWorkers.push(new Worker(new URL("lyra.worker.js",(typeof document === 'undefined' && typeof location === 'undefined' ? new (require('u' + 'rl').URL)('file:' + __filename).href : typeof document === 'undefined' ? location.href : (document.currentScript && document.currentScript.src || new URL('sora.js', document.baseURI).href)))));return}var pthreadMainJs=locateFile("lyra.worker.js");PThread.unusedWorkers.push(new Worker(pthreadMainJs));},getNewWorker:function(){if(PThread.unusedWorkers.length==0){PThread.allocateUnusedWorker();PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0]);}return PThread.unusedWorkers.pop()}};Module["PThread"]=PThread;function callRuntimeCallbacks(callbacks){while(callbacks.length>0){callbacks.shift()(Module);}}function establishStackSpace(){var pthread_ptr=_pthread_self();var stackTop=GROWABLE_HEAP_I32()[pthread_ptr+52>>2];var stackSize=GROWABLE_HEAP_I32()[pthread_ptr+56>>2];var stackMax=stackTop-stackSize;_emscripten_stack_set_limits(stackTop,stackMax);stackRestore(stackTop);}Module["establishStackSpace"]=establishStackSpace;function exitOnMainThread(returnCode){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(2,0,returnCode);try{_exit(returnCode);}catch(e){handleException(e);}}var wasmTableMirror=[];function getWasmTableEntry(funcPtr){var func=wasmTableMirror[funcPtr];if(!func){if(funcPtr>=wasmTableMirror.length)wasmTableMirror.length=funcPtr+1;wasmTableMirror[funcPtr]=func=wasmTable.get(funcPtr);}return func}function invokeEntryPoint(ptr,arg){var result=getWasmTableEntry(ptr)(arg);if(keepRuntimeAlive()){PThread.setExitStatus(result);}else {__emscripten_thread_exit(result);}}Module["invokeEntryPoint"]=invokeEntryPoint;function registerTLSInit(tlsInitFunc){PThread.tlsInitFunctions.push(tlsInitFunc);}function traverseStack(args){if(!args||!args.callee||!args.callee.name){return [null,"",""]}args.callee.toString();var funcname=args.callee.name;var str="(";var first=true;for(var i in args){var a=args[i];if(!first){str+=", ";}first=false;if(typeof a=="number"||typeof a=="string"){str+=a;}else {str+="("+typeof a+")";}}str+=")";var caller=args.callee.caller;args=caller?caller.arguments:[];if(first)str="";return [args,funcname,str]}function jsStackTrace(){var error=new Error;if(!error.stack){try{throw new Error}catch(e){error=e;}if(!error.stack){return "(no stack trace available)"}}return error.stack.toString()}function _emscripten_get_callstack_js(flags){var callstack=jsStackTrace();var iThisFunc=callstack.lastIndexOf("_emscripten_log");var iThisFunc2=callstack.lastIndexOf("_emscripten_get_callstack");var iNextLine=callstack.indexOf("\n",Math.max(iThisFunc,iThisFunc2))+1;callstack=callstack.slice(iNextLine);if(flags&32){warnOnce("EM_LOG_DEMANGLE is deprecated; ignoring");}if(flags&8&&typeof emscripten_source_map=="undefined"){warnOnce('Source map information is not available, emscripten_log with EM_LOG_C_STACK will be ignored. Build with "--pre-js $EMSCRIPTEN/src/emscripten-source-map.min.js" linker flag to add source map loading to code.');flags^=8;flags|=16;}var stack_args=null;if(flags&128){stack_args=traverseStack(arguments);while(stack_args[1].includes("_emscripten_"))stack_args=traverseStack(stack_args[0]);}var lines=callstack.split("\n");callstack="";var newFirefoxRe=new RegExp("\\s*(.*?)@(.*?):([0-9]+):([0-9]+)");var firefoxRe=new RegExp("\\s*(.*?)@(.*):(.*)(:(.*))?");var chromeRe=new RegExp("\\s*at (.*?) \\((.*):(.*):(.*)\\)");for(var l in lines){var line=lines[l];var symbolName="";var file="";var lineno=0;var column=0;var parts=chromeRe.exec(line);if(parts&&parts.length==5){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4];}else {parts=newFirefoxRe.exec(line);if(!parts)parts=firefoxRe.exec(line);if(parts&&parts.length>=4){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4]|0;}else {callstack+=line+"\n";continue}}var haveSourceMap=false;if(flags&8){var orig=emscripten_source_map.originalPositionFor({line:lineno,column:column});haveSourceMap=orig&&orig.source;if(haveSourceMap){if(flags&64){orig.source=orig.source.substring(orig.source.replace(/\\/g,"/").lastIndexOf("/")+1);}callstack+="    at "+symbolName+" ("+orig.source+":"+orig.line+":"+orig.column+")\n";}}if(flags&16||!haveSourceMap){if(flags&64){file=file.substring(file.replace(/\\/g,"/").lastIndexOf("/")+1);}callstack+=(haveSourceMap?"     = "+symbolName:"    at "+symbolName)+" ("+file+":"+lineno+":"+column+")\n";}if(flags&128&&stack_args[0]){if(stack_args[1]==symbolName&&stack_args[2].length>0){callstack=callstack.replace(/\s+$/,"");callstack+=" with values: "+stack_args[1]+stack_args[2]+"\n";}stack_args=traverseStack(stack_args[0]);}}callstack=callstack.replace(/\s+$/,"");return callstack}function __Unwind_Backtrace(func,arg){var trace=_emscripten_get_callstack_js();var parts=trace.split("\n");for(var i=0;i<parts.length;i++){var ret=getWasmTableEntry(func)(0,arg);if(ret!==0)return}}function __Unwind_GetIP(){err("missing function: _Unwind_GetIP");abort(-1);}function ___emscripten_init_main_thread_js(tb){__emscripten_thread_init(tb,!ENVIRONMENT_IS_WORKER,1,!ENVIRONMENT_IS_WEB);PThread.threadInitTLS();}function ___emscripten_thread_cleanup(thread){if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({"cmd":"cleanupThread","thread":thread});}function pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(3,1,pthread_ptr,attr,startRoutine,arg);return ___pthread_create_js(pthread_ptr,attr,startRoutine,arg)}function ___pthread_create_js(pthread_ptr,attr,startRoutine,arg){if(typeof SharedArrayBuffer=="undefined"){err("Current environment does not support SharedArrayBuffer, pthreads are not available!");return 6}var transferList=[];var error=0;if(ENVIRONMENT_IS_PTHREAD&&(transferList.length===0||error)){return pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg)}var threadParams={startRoutine:startRoutine,pthread_ptr:pthread_ptr,arg:arg,transferList:transferList};if(ENVIRONMENT_IS_PTHREAD){threadParams.cmd="spawnThread";postMessage(threadParams,transferList);return 0}return spawnThread(threadParams)}function setErrNo(value){GROWABLE_HEAP_I32()[___errno_location()>>2]=value;return value}function ___syscall_fcntl64(fd,cmd,varargs){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(4,1,fd,cmd,varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=SYSCALLS.get();if(arg<0){return -28}var newStream;newStream=FS.createStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=SYSCALLS.get();stream.flags|=arg;return 0}case 5:{var arg=SYSCALLS.get();var offset=0;GROWABLE_HEAP_I16()[arg+offset>>1]=2;return 0}case 6:case 7:return 0;case 16:case 8:return -28;case 9:setErrNo(28);return -1;default:{return -28}}}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_fstat64(fd,buf){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(5,1,fd,buf);try{var stream=SYSCALLS.getStreamFromFD(fd);return SYSCALLS.doStat(FS.stat,stream.path,buf)}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_getdents64(fd,dirp,count){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(6,1,fd,dirp,count);try{var stream=SYSCALLS.getStreamFromFD(fd);if(!stream.getdents){stream.getdents=FS.readdir(stream.path);}var struct_size=280;var pos=0;var off=FS.llseek(stream,0,1);var idx=Math.floor(off/struct_size);while(idx<stream.getdents.length&&pos+struct_size<=count){var id;var type;var name=stream.getdents[idx];if(name==="."){id=stream.node.id;type=4;}else if(name===".."){var lookup=FS.lookupPath(stream.path,{parent:true});id=lookup.node.id;type=4;}else {var child=FS.lookupNode(stream.node,name);id=child.id;type=FS.isChrdev(child.mode)?2:FS.isDir(child.mode)?4:FS.isLink(child.mode)?10:8;}tempI64=[id>>>0,(tempDouble=id,+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[dirp+pos>>2]=tempI64[0],GROWABLE_HEAP_I32()[dirp+pos+4>>2]=tempI64[1];tempI64=[(idx+1)*struct_size>>>0,(tempDouble=(idx+1)*struct_size,+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[dirp+pos+8>>2]=tempI64[0],GROWABLE_HEAP_I32()[dirp+pos+12>>2]=tempI64[1];GROWABLE_HEAP_I16()[dirp+pos+16>>1]=280;GROWABLE_HEAP_I8()[dirp+pos+18>>0]=type;stringToUTF8(name,dirp+pos+19,256);pos+=struct_size;idx+=1;}FS.llseek(stream,idx*struct_size,0);return pos}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_ioctl(fd,op,varargs){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(7,1,fd,op,varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:case 21505:{if(!stream.tty)return -59;return 0}case 21510:case 21511:case 21512:case 21506:case 21507:case 21508:{if(!stream.tty)return -59;return 0}case 21519:{if(!stream.tty)return -59;var argp=SYSCALLS.get();GROWABLE_HEAP_I32()[argp>>2]=0;return 0}case 21520:{if(!stream.tty)return -59;return -28}case 21531:{var argp=SYSCALLS.get();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return -59;return 0}case 21524:{if(!stream.tty)return -59;return 0}default:return -28}}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_lstat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(8,1,path,buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.doStat(FS.lstat,path,buf)}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_newfstatat(dirfd,path,buf,flags){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(9,1,dirfd,path,buf,flags);try{path=SYSCALLS.getStr(path);var nofollow=flags&256;var allowEmpty=flags&4096;flags=flags&~4352;path=SYSCALLS.calculateAt(dirfd,path,allowEmpty);return SYSCALLS.doStat(nofollow?FS.lstat:FS.stat,path,buf)}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(10,1,dirfd,path,flags,varargs);SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?SYSCALLS.get():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_stat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(11,1,path,buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.doStat(FS.stat,path,buf)}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function ___syscall_unlinkat(dirfd,path,flags){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(12,1,dirfd,path,flags);try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);if(flags===0){FS.unlink(path);}else if(flags===512){FS.rmdir(path);}else {abort("Invalid flags passed to unlinkat");}return 0}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function __dlinit(main_dso_handle){}var dlopenMissingError="To use dlopen, you need enable dynamic linking, see https://github.com/emscripten-core/emscripten/wiki/Linking";function __dlopen_js(filename,flag){abort(dlopenMissingError);}function __dlsym_js(handle,symbol){abort(dlopenMissingError);}function __embind_register_bigint(primitiveType,name,size,minRange,maxRange){}function getShiftFromSize(size){switch(size){case 1:return 0;case 2:return 1;case 4:return 2;case 8:return 3;default:throw new TypeError("Unknown type size: "+size)}}function embind_init_charCodes(){var codes=new Array(256);for(var i=0;i<256;++i){codes[i]=String.fromCharCode(i);}embind_charCodes=codes;}var embind_charCodes=undefined;function readLatin1String(ptr){var ret="";var c=ptr;while(GROWABLE_HEAP_U8()[c]){ret+=embind_charCodes[GROWABLE_HEAP_U8()[c++]];}return ret}var awaitingDependencies={};var registeredTypes={};var typeDependencies={};var char_0=48;var char_9=57;function makeLegalFunctionName(name){if(undefined===name){return "_unknown"}name=name.replace(/[^a-zA-Z0-9_]/g,"$");var f=name.charCodeAt(0);if(f>=char_0&&f<=char_9){return "_"+name}return name}function createNamedFunction(name,body){name=makeLegalFunctionName(name);return new Function("body","return function "+name+"() {\n"+'    "use strict";'+"    return body.apply(this, arguments);\n"+"};\n")(body)}function extendError(baseErrorType,errorName){var errorClass=createNamedFunction(errorName,function(message){this.name=errorName;this.message=message;var stack=new Error(message).stack;if(stack!==undefined){this.stack=this.toString()+"\n"+stack.replace(/^Error(:[^\n]*)?\n/,"");}});errorClass.prototype=Object.create(baseErrorType.prototype);errorClass.prototype.constructor=errorClass;errorClass.prototype.toString=function(){if(this.message===undefined){return this.name}else {return this.name+": "+this.message}};return errorClass}var BindingError=undefined;function throwBindingError(message){throw new BindingError(message)}var InternalError=undefined;function throwInternalError(message){throw new InternalError(message)}function whenDependentTypesAreResolved(myTypes,dependentTypes,getTypeConverters){myTypes.forEach(function(type){typeDependencies[type]=dependentTypes;});function onComplete(typeConverters){var myTypeConverters=getTypeConverters(typeConverters);if(myTypeConverters.length!==myTypes.length){throwInternalError("Mismatched type converter count");}for(var i=0;i<myTypes.length;++i){registerType(myTypes[i],myTypeConverters[i]);}}var typeConverters=new Array(dependentTypes.length);var unregisteredTypes=[];var registered=0;dependentTypes.forEach((dt,i)=>{if(registeredTypes.hasOwnProperty(dt)){typeConverters[i]=registeredTypes[dt];}else {unregisteredTypes.push(dt);if(!awaitingDependencies.hasOwnProperty(dt)){awaitingDependencies[dt]=[];}awaitingDependencies[dt].push(()=>{typeConverters[i]=registeredTypes[dt];++registered;if(registered===unregisteredTypes.length){onComplete(typeConverters);}});}});if(0===unregisteredTypes.length){onComplete(typeConverters);}}function registerType(rawType,registeredInstance,options={}){if(!("argPackAdvance"in registeredInstance)){throw new TypeError("registerType registeredInstance requires argPackAdvance")}var name=registeredInstance.name;if(!rawType){throwBindingError('type "'+name+'" must have a positive integer typeid pointer');}if(registeredTypes.hasOwnProperty(rawType)){if(options.ignoreDuplicateRegistrations){return}else {throwBindingError("Cannot register type '"+name+"' twice");}}registeredTypes[rawType]=registeredInstance;delete typeDependencies[rawType];if(awaitingDependencies.hasOwnProperty(rawType)){var callbacks=awaitingDependencies[rawType];delete awaitingDependencies[rawType];callbacks.forEach(cb=>cb());}}function __embind_register_bool(rawType,name,size,trueValue,falseValue){var shift=getShiftFromSize(size);name=readLatin1String(name);registerType(rawType,{name:name,"fromWireType":function(wt){return !!wt},"toWireType":function(destructors,o){return o?trueValue:falseValue},"argPackAdvance":8,"readValueFromPointer":function(pointer){var heap;if(size===1){heap=GROWABLE_HEAP_I8();}else if(size===2){heap=GROWABLE_HEAP_I16();}else if(size===4){heap=GROWABLE_HEAP_I32();}else {throw new TypeError("Unknown boolean type size: "+name)}return this["fromWireType"](heap[pointer>>shift])},destructorFunction:null});}function ClassHandle_isAliasOf(other){if(!(this instanceof ClassHandle)){return false}if(!(other instanceof ClassHandle)){return false}var leftClass=this.$$.ptrType.registeredClass;var left=this.$$.ptr;var rightClass=other.$$.ptrType.registeredClass;var right=other.$$.ptr;while(leftClass.baseClass){left=leftClass.upcast(left);leftClass=leftClass.baseClass;}while(rightClass.baseClass){right=rightClass.upcast(right);rightClass=rightClass.baseClass;}return leftClass===rightClass&&left===right}function shallowCopyInternalPointer(o){return {count:o.count,deleteScheduled:o.deleteScheduled,preservePointerOnDelete:o.preservePointerOnDelete,ptr:o.ptr,ptrType:o.ptrType,smartPtr:o.smartPtr,smartPtrType:o.smartPtrType}}function throwInstanceAlreadyDeleted(obj){function getInstanceTypeName(handle){return handle.$$.ptrType.registeredClass.name}throwBindingError(getInstanceTypeName(obj)+" instance already deleted");}var finalizationRegistry=false;function detachFinalizer(handle){}function runDestructor($$){if($$.smartPtr){$$.smartPtrType.rawDestructor($$.smartPtr);}else {$$.ptrType.registeredClass.rawDestructor($$.ptr);}}function releaseClassHandle($$){$$.count.value-=1;var toDelete=0===$$.count.value;if(toDelete){runDestructor($$);}}function downcastPointer(ptr,ptrClass,desiredClass){if(ptrClass===desiredClass){return ptr}if(undefined===desiredClass.baseClass){return null}var rv=downcastPointer(ptr,ptrClass,desiredClass.baseClass);if(rv===null){return null}return desiredClass.downcast(rv)}var registeredPointers={};function getInheritedInstanceCount(){return Object.keys(registeredInstances).length}function getLiveInheritedInstances(){var rv=[];for(var k in registeredInstances){if(registeredInstances.hasOwnProperty(k)){rv.push(registeredInstances[k]);}}return rv}var deletionQueue=[];function flushPendingDeletes(){while(deletionQueue.length){var obj=deletionQueue.pop();obj.$$.deleteScheduled=false;obj["delete"]();}}var delayFunction=undefined;function setDelayFunction(fn){delayFunction=fn;if(deletionQueue.length&&delayFunction){delayFunction(flushPendingDeletes);}}function init_embind(){Module["getInheritedInstanceCount"]=getInheritedInstanceCount;Module["getLiveInheritedInstances"]=getLiveInheritedInstances;Module["flushPendingDeletes"]=flushPendingDeletes;Module["setDelayFunction"]=setDelayFunction;}var registeredInstances={};function getBasestPointer(class_,ptr){if(ptr===undefined){throwBindingError("ptr should not be undefined");}while(class_.baseClass){ptr=class_.upcast(ptr);class_=class_.baseClass;}return ptr}function getInheritedInstance(class_,ptr){ptr=getBasestPointer(class_,ptr);return registeredInstances[ptr]}function makeClassHandle(prototype,record){if(!record.ptrType||!record.ptr){throwInternalError("makeClassHandle requires ptr and ptrType");}var hasSmartPtrType=!!record.smartPtrType;var hasSmartPtr=!!record.smartPtr;if(hasSmartPtrType!==hasSmartPtr){throwInternalError("Both smartPtrType and smartPtr must be specified");}record.count={value:1};return attachFinalizer(Object.create(prototype,{$$:{value:record}}))}function RegisteredPointer_fromWireType(ptr){var rawPointer=this.getPointee(ptr);if(!rawPointer){this.destructor(ptr);return null}var registeredInstance=getInheritedInstance(this.registeredClass,rawPointer);if(undefined!==registeredInstance){if(0===registeredInstance.$$.count.value){registeredInstance.$$.ptr=rawPointer;registeredInstance.$$.smartPtr=ptr;return registeredInstance["clone"]()}else {var rv=registeredInstance["clone"]();this.destructor(ptr);return rv}}function makeDefaultHandle(){if(this.isSmartPointer){return makeClassHandle(this.registeredClass.instancePrototype,{ptrType:this.pointeeType,ptr:rawPointer,smartPtrType:this,smartPtr:ptr})}else {return makeClassHandle(this.registeredClass.instancePrototype,{ptrType:this,ptr:ptr})}}var actualType=this.registeredClass.getActualType(rawPointer);var registeredPointerRecord=registeredPointers[actualType];if(!registeredPointerRecord){return makeDefaultHandle.call(this)}var toType;if(this.isConst){toType=registeredPointerRecord.constPointerType;}else {toType=registeredPointerRecord.pointerType;}var dp=downcastPointer(rawPointer,this.registeredClass,toType.registeredClass);if(dp===null){return makeDefaultHandle.call(this)}if(this.isSmartPointer){return makeClassHandle(toType.registeredClass.instancePrototype,{ptrType:toType,ptr:dp,smartPtrType:this,smartPtr:ptr})}else {return makeClassHandle(toType.registeredClass.instancePrototype,{ptrType:toType,ptr:dp})}}function attachFinalizer(handle){if("undefined"===typeof FinalizationRegistry){attachFinalizer=handle=>handle;return handle}finalizationRegistry=new FinalizationRegistry(info=>{releaseClassHandle(info.$$);});attachFinalizer=handle=>{var $$=handle.$$;var hasSmartPtr=!!$$.smartPtr;if(hasSmartPtr){var info={$$:$$};finalizationRegistry.register(handle,info,handle);}return handle};detachFinalizer=handle=>finalizationRegistry.unregister(handle);return attachFinalizer(handle)}function ClassHandle_clone(){if(!this.$$.ptr){throwInstanceAlreadyDeleted(this);}if(this.$$.preservePointerOnDelete){this.$$.count.value+=1;return this}else {var clone=attachFinalizer(Object.create(Object.getPrototypeOf(this),{$$:{value:shallowCopyInternalPointer(this.$$)}}));clone.$$.count.value+=1;clone.$$.deleteScheduled=false;return clone}}function ClassHandle_delete(){if(!this.$$.ptr){throwInstanceAlreadyDeleted(this);}if(this.$$.deleteScheduled&&!this.$$.preservePointerOnDelete){throwBindingError("Object already scheduled for deletion");}detachFinalizer(this);releaseClassHandle(this.$$);if(!this.$$.preservePointerOnDelete){this.$$.smartPtr=undefined;this.$$.ptr=undefined;}}function ClassHandle_isDeleted(){return !this.$$.ptr}function ClassHandle_deleteLater(){if(!this.$$.ptr){throwInstanceAlreadyDeleted(this);}if(this.$$.deleteScheduled&&!this.$$.preservePointerOnDelete){throwBindingError("Object already scheduled for deletion");}deletionQueue.push(this);if(deletionQueue.length===1&&delayFunction){delayFunction(flushPendingDeletes);}this.$$.deleteScheduled=true;return this}function init_ClassHandle(){ClassHandle.prototype["isAliasOf"]=ClassHandle_isAliasOf;ClassHandle.prototype["clone"]=ClassHandle_clone;ClassHandle.prototype["delete"]=ClassHandle_delete;ClassHandle.prototype["isDeleted"]=ClassHandle_isDeleted;ClassHandle.prototype["deleteLater"]=ClassHandle_deleteLater;}function ClassHandle(){}function ensureOverloadTable(proto,methodName,humanName){if(undefined===proto[methodName].overloadTable){var prevFunc=proto[methodName];proto[methodName]=function(){if(!proto[methodName].overloadTable.hasOwnProperty(arguments.length)){throwBindingError("Function '"+humanName+"' called with an invalid number of arguments ("+arguments.length+") - expects one of ("+proto[methodName].overloadTable+")!");}return proto[methodName].overloadTable[arguments.length].apply(this,arguments)};proto[methodName].overloadTable=[];proto[methodName].overloadTable[prevFunc.argCount]=prevFunc;}}function exposePublicSymbol(name,value,numArguments){if(Module.hasOwnProperty(name)){if(undefined===numArguments||undefined!==Module[name].overloadTable&&undefined!==Module[name].overloadTable[numArguments]){throwBindingError("Cannot register public name '"+name+"' twice");}ensureOverloadTable(Module,name,name);if(Module.hasOwnProperty(numArguments)){throwBindingError("Cannot register multiple overloads of a function with the same number of arguments ("+numArguments+")!");}Module[name].overloadTable[numArguments]=value;}else {Module[name]=value;if(undefined!==numArguments){Module[name].numArguments=numArguments;}}}function RegisteredClass(name,constructor,instancePrototype,rawDestructor,baseClass,getActualType,upcast,downcast){this.name=name;this.constructor=constructor;this.instancePrototype=instancePrototype;this.rawDestructor=rawDestructor;this.baseClass=baseClass;this.getActualType=getActualType;this.upcast=upcast;this.downcast=downcast;this.pureVirtualFunctions=[];}function upcastPointer(ptr,ptrClass,desiredClass){while(ptrClass!==desiredClass){if(!ptrClass.upcast){throwBindingError("Expected null or instance of "+desiredClass.name+", got an instance of "+ptrClass.name);}ptr=ptrClass.upcast(ptr);ptrClass=ptrClass.baseClass;}return ptr}function constNoSmartPtrRawPointerToWireType(destructors,handle){if(handle===null){if(this.isReference){throwBindingError("null is not a valid "+this.name);}return 0}if(!handle.$$){throwBindingError('Cannot pass "'+embindRepr(handle)+'" as a '+this.name);}if(!handle.$$.ptr){throwBindingError("Cannot pass deleted object as a pointer of type "+this.name);}var handleClass=handle.$$.ptrType.registeredClass;var ptr=upcastPointer(handle.$$.ptr,handleClass,this.registeredClass);return ptr}function genericPointerToWireType(destructors,handle){var ptr;if(handle===null){if(this.isReference){throwBindingError("null is not a valid "+this.name);}if(this.isSmartPointer){ptr=this.rawConstructor();if(destructors!==null){destructors.push(this.rawDestructor,ptr);}return ptr}else {return 0}}if(!handle.$$){throwBindingError('Cannot pass "'+embindRepr(handle)+'" as a '+this.name);}if(!handle.$$.ptr){throwBindingError("Cannot pass deleted object as a pointer of type "+this.name);}if(!this.isConst&&handle.$$.ptrType.isConst){throwBindingError("Cannot convert argument of type "+(handle.$$.smartPtrType?handle.$$.smartPtrType.name:handle.$$.ptrType.name)+" to parameter type "+this.name);}var handleClass=handle.$$.ptrType.registeredClass;ptr=upcastPointer(handle.$$.ptr,handleClass,this.registeredClass);if(this.isSmartPointer){if(undefined===handle.$$.smartPtr){throwBindingError("Passing raw pointer to smart pointer is illegal");}switch(this.sharingPolicy){case 0:if(handle.$$.smartPtrType===this){ptr=handle.$$.smartPtr;}else {throwBindingError("Cannot convert argument of type "+(handle.$$.smartPtrType?handle.$$.smartPtrType.name:handle.$$.ptrType.name)+" to parameter type "+this.name);}break;case 1:ptr=handle.$$.smartPtr;break;case 2:if(handle.$$.smartPtrType===this){ptr=handle.$$.smartPtr;}else {var clonedHandle=handle["clone"]();ptr=this.rawShare(ptr,Emval.toHandle(function(){clonedHandle["delete"]();}));if(destructors!==null){destructors.push(this.rawDestructor,ptr);}}break;default:throwBindingError("Unsupporting sharing policy");}}return ptr}function nonConstNoSmartPtrRawPointerToWireType(destructors,handle){if(handle===null){if(this.isReference){throwBindingError("null is not a valid "+this.name);}return 0}if(!handle.$$){throwBindingError('Cannot pass "'+embindRepr(handle)+'" as a '+this.name);}if(!handle.$$.ptr){throwBindingError("Cannot pass deleted object as a pointer of type "+this.name);}if(handle.$$.ptrType.isConst){throwBindingError("Cannot convert argument of type "+handle.$$.ptrType.name+" to parameter type "+this.name);}var handleClass=handle.$$.ptrType.registeredClass;var ptr=upcastPointer(handle.$$.ptr,handleClass,this.registeredClass);return ptr}function simpleReadValueFromPointer(pointer){return this["fromWireType"](GROWABLE_HEAP_I32()[pointer>>2])}function RegisteredPointer_getPointee(ptr){if(this.rawGetPointee){ptr=this.rawGetPointee(ptr);}return ptr}function RegisteredPointer_destructor(ptr){if(this.rawDestructor){this.rawDestructor(ptr);}}function RegisteredPointer_deleteObject(handle){if(handle!==null){handle["delete"]();}}function init_RegisteredPointer(){RegisteredPointer.prototype.getPointee=RegisteredPointer_getPointee;RegisteredPointer.prototype.destructor=RegisteredPointer_destructor;RegisteredPointer.prototype["argPackAdvance"]=8;RegisteredPointer.prototype["readValueFromPointer"]=simpleReadValueFromPointer;RegisteredPointer.prototype["deleteObject"]=RegisteredPointer_deleteObject;RegisteredPointer.prototype["fromWireType"]=RegisteredPointer_fromWireType;}function RegisteredPointer(name,registeredClass,isReference,isConst,isSmartPointer,pointeeType,sharingPolicy,rawGetPointee,rawConstructor,rawShare,rawDestructor){this.name=name;this.registeredClass=registeredClass;this.isReference=isReference;this.isConst=isConst;this.isSmartPointer=isSmartPointer;this.pointeeType=pointeeType;this.sharingPolicy=sharingPolicy;this.rawGetPointee=rawGetPointee;this.rawConstructor=rawConstructor;this.rawShare=rawShare;this.rawDestructor=rawDestructor;if(!isSmartPointer&&registeredClass.baseClass===undefined){if(isConst){this["toWireType"]=constNoSmartPtrRawPointerToWireType;this.destructorFunction=null;}else {this["toWireType"]=nonConstNoSmartPtrRawPointerToWireType;this.destructorFunction=null;}}else {this["toWireType"]=genericPointerToWireType;}}function replacePublicSymbol(name,value,numArguments){if(!Module.hasOwnProperty(name)){throwInternalError("Replacing nonexistant public symbol");}if(undefined!==Module[name].overloadTable&&undefined!==numArguments){Module[name].overloadTable[numArguments]=value;}else {Module[name]=value;Module[name].argCount=numArguments;}}function dynCallLegacy(sig,ptr,args){var f=Module["dynCall_"+sig];return args&&args.length?f.apply(null,[ptr].concat(args)):f.call(null,ptr)}function dynCall(sig,ptr,args){if(sig.includes("j")){return dynCallLegacy(sig,ptr,args)}var rtn=getWasmTableEntry(ptr).apply(null,args);return rtn}function getDynCaller(sig,ptr){var argCache=[];return function(){argCache.length=0;Object.assign(argCache,arguments);return dynCall(sig,ptr,argCache)}}function embind__requireFunction(signature,rawFunction){signature=readLatin1String(signature);function makeDynCaller(){if(signature.includes("j")){return getDynCaller(signature,rawFunction)}return getWasmTableEntry(rawFunction)}var fp=makeDynCaller();if(typeof fp!="function"){throwBindingError("unknown function pointer with signature "+signature+": "+rawFunction);}return fp}var UnboundTypeError=undefined;function getTypeName(type){var ptr=___getTypeName(type);var rv=readLatin1String(ptr);_free(ptr);return rv}function throwUnboundTypeError(message,types){var unboundTypes=[];var seen={};function visit(type){if(seen[type]){return}if(registeredTypes[type]){return}if(typeDependencies[type]){typeDependencies[type].forEach(visit);return}unboundTypes.push(type);seen[type]=true;}types.forEach(visit);throw new UnboundTypeError(message+": "+unboundTypes.map(getTypeName).join([", "]))}function __embind_register_class(rawType,rawPointerType,rawConstPointerType,baseClassRawType,getActualTypeSignature,getActualType,upcastSignature,upcast,downcastSignature,downcast,name,destructorSignature,rawDestructor){name=readLatin1String(name);getActualType=embind__requireFunction(getActualTypeSignature,getActualType);if(upcast){upcast=embind__requireFunction(upcastSignature,upcast);}if(downcast){downcast=embind__requireFunction(downcastSignature,downcast);}rawDestructor=embind__requireFunction(destructorSignature,rawDestructor);var legalFunctionName=makeLegalFunctionName(name);exposePublicSymbol(legalFunctionName,function(){throwUnboundTypeError("Cannot construct "+name+" due to unbound types",[baseClassRawType]);});whenDependentTypesAreResolved([rawType,rawPointerType,rawConstPointerType],baseClassRawType?[baseClassRawType]:[],function(base){base=base[0];var baseClass;var basePrototype;if(baseClassRawType){baseClass=base.registeredClass;basePrototype=baseClass.instancePrototype;}else {basePrototype=ClassHandle.prototype;}var constructor=createNamedFunction(legalFunctionName,function(){if(Object.getPrototypeOf(this)!==instancePrototype){throw new BindingError("Use 'new' to construct "+name)}if(undefined===registeredClass.constructor_body){throw new BindingError(name+" has no accessible constructor")}var body=registeredClass.constructor_body[arguments.length];if(undefined===body){throw new BindingError("Tried to invoke ctor of "+name+" with invalid number of parameters ("+arguments.length+") - expected ("+Object.keys(registeredClass.constructor_body).toString()+") parameters instead!")}return body.apply(this,arguments)});var instancePrototype=Object.create(basePrototype,{constructor:{value:constructor}});constructor.prototype=instancePrototype;var registeredClass=new RegisteredClass(name,constructor,instancePrototype,rawDestructor,baseClass,getActualType,upcast,downcast);var referenceConverter=new RegisteredPointer(name,registeredClass,true,false,false);var pointerConverter=new RegisteredPointer(name+"*",registeredClass,false,false,false);var constPointerConverter=new RegisteredPointer(name+" const*",registeredClass,false,true,false);registeredPointers[rawType]={pointerType:pointerConverter,constPointerType:constPointerConverter};replacePublicSymbol(legalFunctionName,constructor);return [referenceConverter,pointerConverter,constPointerConverter]});}function new_(constructor,argumentList){if(!(constructor instanceof Function)){throw new TypeError("new_ called with constructor type "+typeof constructor+" which is not a function")}var dummy=createNamedFunction(constructor.name||"unknownFunctionName",function(){});dummy.prototype=constructor.prototype;var obj=new dummy;var r=constructor.apply(obj,argumentList);return r instanceof Object?r:obj}function runDestructors(destructors){while(destructors.length){var ptr=destructors.pop();var del=destructors.pop();del(ptr);}}function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=false;for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}var returns=argTypes[0].name!=="void";var argsList="";var argsListWired="";for(var i=0;i<argCount-2;++i){argsList+=(i!==0?", ":"")+"arg"+i;argsListWired+=(i!==0?", ":"")+"arg"+i+"Wired";}var invokerFnBody="return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n"+"if (arguments.length !== "+(argCount-2)+") {\n"+"throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount-2)+" args!');\n"+"}\n";if(needsDestructorStack){invokerFnBody+="var destructors = [];\n";}var dtorStack=needsDestructorStack?"destructors":"null";var args1=["throwBindingError","invoker","fn","runDestructors","retType","classParam"];var args2=[throwBindingError,cppInvokerFunc,cppTargetFunc,runDestructors,argTypes[0],argTypes[1]];if(isClassMethodFunc){invokerFnBody+="var thisWired = classParam.toWireType("+dtorStack+", this);\n";}for(var i=0;i<argCount-2;++i){invokerFnBody+="var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";args1.push("argType"+i);args2.push(argTypes[i+2]);}if(isClassMethodFunc){argsListWired="thisWired"+(argsListWired.length>0?", ":"")+argsListWired;}invokerFnBody+=(returns?"var rv = ":"")+"invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";if(needsDestructorStack){invokerFnBody+="runDestructors(destructors);\n";}else {for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){var paramName=i===1?"thisWired":"arg"+(i-2)+"Wired";if(argTypes[i].destructorFunction!==null){invokerFnBody+=paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";args1.push(paramName+"_dtor");args2.push(argTypes[i].destructorFunction);}}}if(returns){invokerFnBody+="var ret = retType.fromWireType(rv);\n"+"return ret;\n";}invokerFnBody+="}\n";args1.push(invokerFnBody);var invokerFunction=new_(Function,args1).apply(null,args2);return invokerFunction}function heap32VectorToArray(count,firstElement){var array=[];for(var i=0;i<count;i++){array.push(GROWABLE_HEAP_U32()[firstElement+i*4>>2]);}return array}function __embind_register_class_class_function(rawClassType,methodName,argCount,rawArgTypesAddr,invokerSignature,rawInvoker,fn){var rawArgTypes=heap32VectorToArray(argCount,rawArgTypesAddr);methodName=readLatin1String(methodName);rawInvoker=embind__requireFunction(invokerSignature,rawInvoker);whenDependentTypesAreResolved([],[rawClassType],function(classType){classType=classType[0];var humanName=classType.name+"."+methodName;function unboundTypesHandler(){throwUnboundTypeError("Cannot call "+humanName+" due to unbound types",rawArgTypes);}if(methodName.startsWith("@@")){methodName=Symbol[methodName.substring(2)];}var proto=classType.registeredClass.constructor;if(undefined===proto[methodName]){unboundTypesHandler.argCount=argCount-1;proto[methodName]=unboundTypesHandler;}else {ensureOverloadTable(proto,methodName,humanName);proto[methodName].overloadTable[argCount-1]=unboundTypesHandler;}whenDependentTypesAreResolved([],rawArgTypes,function(argTypes){var invokerArgsArray=[argTypes[0],null].concat(argTypes.slice(1));var func=craftInvokerFunction(humanName,invokerArgsArray,null,rawInvoker,fn);if(undefined===proto[methodName].overloadTable){func.argCount=argCount-1;proto[methodName]=func;}else {proto[methodName].overloadTable[argCount-1]=func;}return []});return []});}function __embind_register_class_constructor(rawClassType,argCount,rawArgTypesAddr,invokerSignature,invoker,rawConstructor){assert(argCount>0);var rawArgTypes=heap32VectorToArray(argCount,rawArgTypesAddr);invoker=embind__requireFunction(invokerSignature,invoker);whenDependentTypesAreResolved([],[rawClassType],function(classType){classType=classType[0];var humanName="constructor "+classType.name;if(undefined===classType.registeredClass.constructor_body){classType.registeredClass.constructor_body=[];}if(undefined!==classType.registeredClass.constructor_body[argCount-1]){throw new BindingError("Cannot register multiple constructors with identical number of parameters ("+(argCount-1)+") for class '"+classType.name+"'! Overload resolution is currently only performed using the parameter count, not actual type info!")}classType.registeredClass.constructor_body[argCount-1]=()=>{throwUnboundTypeError("Cannot construct "+classType.name+" due to unbound types",rawArgTypes);};whenDependentTypesAreResolved([],rawArgTypes,function(argTypes){argTypes.splice(1,0,null);classType.registeredClass.constructor_body[argCount-1]=craftInvokerFunction(humanName,argTypes,null,invoker,rawConstructor);return []});return []});}function __embind_register_class_function(rawClassType,methodName,argCount,rawArgTypesAddr,invokerSignature,rawInvoker,context,isPureVirtual){var rawArgTypes=heap32VectorToArray(argCount,rawArgTypesAddr);methodName=readLatin1String(methodName);rawInvoker=embind__requireFunction(invokerSignature,rawInvoker);whenDependentTypesAreResolved([],[rawClassType],function(classType){classType=classType[0];var humanName=classType.name+"."+methodName;if(methodName.startsWith("@@")){methodName=Symbol[methodName.substring(2)];}if(isPureVirtual){classType.registeredClass.pureVirtualFunctions.push(methodName);}function unboundTypesHandler(){throwUnboundTypeError("Cannot call "+humanName+" due to unbound types",rawArgTypes);}var proto=classType.registeredClass.instancePrototype;var method=proto[methodName];if(undefined===method||undefined===method.overloadTable&&method.className!==classType.name&&method.argCount===argCount-2){unboundTypesHandler.argCount=argCount-2;unboundTypesHandler.className=classType.name;proto[methodName]=unboundTypesHandler;}else {ensureOverloadTable(proto,methodName,humanName);proto[methodName].overloadTable[argCount-2]=unboundTypesHandler;}whenDependentTypesAreResolved([],rawArgTypes,function(argTypes){var memberFunction=craftInvokerFunction(humanName,argTypes,classType,rawInvoker,context);if(undefined===proto[methodName].overloadTable){memberFunction.argCount=argCount-2;proto[methodName]=memberFunction;}else {proto[methodName].overloadTable[argCount-2]=memberFunction;}return []});return []});}var emval_free_list=[];var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];function __emval_decref(handle){if(handle>4&&0===--emval_handle_array[handle].refcount){emval_handle_array[handle]=undefined;emval_free_list.push(handle);}}function count_emval_handles(){var count=0;for(var i=5;i<emval_handle_array.length;++i){if(emval_handle_array[i]!==undefined){++count;}}return count}function get_first_emval(){for(var i=5;i<emval_handle_array.length;++i){if(emval_handle_array[i]!==undefined){return emval_handle_array[i]}}return null}function init_emval(){Module["count_emval_handles"]=count_emval_handles;Module["get_first_emval"]=get_first_emval;}var Emval={toValue:handle=>{if(!handle){throwBindingError("Cannot use deleted val. handle = "+handle);}return emval_handle_array[handle].value},toHandle:value=>{switch(value){case undefined:return 1;case null:return 2;case true:return 3;case false:return 4;default:{var handle=emval_free_list.length?emval_free_list.pop():emval_handle_array.length;emval_handle_array[handle]={refcount:1,value:value};return handle}}}};function __embind_register_emval(rawType,name){name=readLatin1String(name);registerType(rawType,{name:name,"fromWireType":function(handle){var rv=Emval.toValue(handle);__emval_decref(handle);return rv},"toWireType":function(destructors,value){return Emval.toHandle(value)},"argPackAdvance":8,"readValueFromPointer":simpleReadValueFromPointer,destructorFunction:null});}function embindRepr(v){if(v===null){return "null"}var t=typeof v;if(t==="object"||t==="array"||t==="function"){return v.toString()}else {return ""+v}}function floatReadValueFromPointer(name,shift){switch(shift){case 2:return function(pointer){return this["fromWireType"](GROWABLE_HEAP_F32()[pointer>>2])};case 3:return function(pointer){return this["fromWireType"](GROWABLE_HEAP_F64()[pointer>>3])};default:throw new TypeError("Unknown float type: "+name)}}function __embind_register_float(rawType,name,size){var shift=getShiftFromSize(size);name=readLatin1String(name);registerType(rawType,{name:name,"fromWireType":function(value){return value},"toWireType":function(destructors,value){return value},"argPackAdvance":8,"readValueFromPointer":floatReadValueFromPointer(name,shift),destructorFunction:null});}function __embind_register_function(name,argCount,rawArgTypesAddr,signature,rawInvoker,fn){var argTypes=heap32VectorToArray(argCount,rawArgTypesAddr);name=readLatin1String(name);rawInvoker=embind__requireFunction(signature,rawInvoker);exposePublicSymbol(name,function(){throwUnboundTypeError("Cannot call "+name+" due to unbound types",argTypes);},argCount-1);whenDependentTypesAreResolved([],argTypes,function(argTypes){var invokerArgsArray=[argTypes[0],null].concat(argTypes.slice(1));replacePublicSymbol(name,craftInvokerFunction(name,invokerArgsArray,null,rawInvoker,fn),argCount-1);return []});}function integerReadValueFromPointer(name,shift,signed){switch(shift){case 0:return signed?function readS8FromPointer(pointer){return GROWABLE_HEAP_I8()[pointer]}:function readU8FromPointer(pointer){return GROWABLE_HEAP_U8()[pointer]};case 1:return signed?function readS16FromPointer(pointer){return GROWABLE_HEAP_I16()[pointer>>1]}:function readU16FromPointer(pointer){return GROWABLE_HEAP_U16()[pointer>>1]};case 2:return signed?function readS32FromPointer(pointer){return GROWABLE_HEAP_I32()[pointer>>2]}:function readU32FromPointer(pointer){return GROWABLE_HEAP_U32()[pointer>>2]};default:throw new TypeError("Unknown integer type: "+name)}}function __embind_register_integer(primitiveType,name,size,minRange,maxRange){name=readLatin1String(name);var shift=getShiftFromSize(size);var fromWireType=value=>value;if(minRange===0){var bitshift=32-8*size;fromWireType=value=>value<<bitshift>>>bitshift;}var isUnsignedType=name.includes("unsigned");var checkAssertions=(value,toTypeName)=>{};var toWireType;if(isUnsignedType){toWireType=function(destructors,value){checkAssertions(value,this.name);return value>>>0};}else {toWireType=function(destructors,value){checkAssertions(value,this.name);return value};}registerType(primitiveType,{name:name,"fromWireType":fromWireType,"toWireType":toWireType,"argPackAdvance":8,"readValueFromPointer":integerReadValueFromPointer(name,shift,minRange!==0),destructorFunction:null});}function __embind_register_memory_view(rawType,dataTypeIndex,name){var typeMapping=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array];var TA=typeMapping[dataTypeIndex];function decodeMemoryView(handle){handle=handle>>2;var heap=GROWABLE_HEAP_U32();var size=heap[handle];var data=heap[handle+1];return new TA(buffer,data,size)}name=readLatin1String(name);registerType(rawType,{name:name,"fromWireType":decodeMemoryView,"argPackAdvance":8,"readValueFromPointer":decodeMemoryView},{ignoreDuplicateRegistrations:true});}function __embind_register_std_string(rawType,name){name=readLatin1String(name);var stdStringIsUTF8=name==="std::string";registerType(rawType,{name:name,"fromWireType":function(value){var length=GROWABLE_HEAP_U32()[value>>2];var payload=value+4;var str;if(stdStringIsUTF8){var decodeStartPtr=payload;for(var i=0;i<=length;++i){var currentBytePtr=payload+i;if(i==length||GROWABLE_HEAP_U8()[currentBytePtr]==0){var maxRead=currentBytePtr-decodeStartPtr;var stringSegment=UTF8ToString(decodeStartPtr,maxRead);if(str===undefined){str=stringSegment;}else {str+=String.fromCharCode(0);str+=stringSegment;}decodeStartPtr=currentBytePtr+1;}}}else {var a=new Array(length);for(var i=0;i<length;++i){a[i]=String.fromCharCode(GROWABLE_HEAP_U8()[payload+i]);}str=a.join("");}_free(value);return str},"toWireType":function(destructors,value){if(value instanceof ArrayBuffer){value=new Uint8Array(value);}var length;var valueIsOfTypeString=typeof value=="string";if(!(valueIsOfTypeString||value instanceof Uint8Array||value instanceof Uint8ClampedArray||value instanceof Int8Array)){throwBindingError("Cannot pass non-string to std::string");}if(stdStringIsUTF8&&valueIsOfTypeString){length=lengthBytesUTF8(value);}else {length=value.length;}var base=_malloc(4+length+1);var ptr=base+4;GROWABLE_HEAP_U32()[base>>2]=length;if(stdStringIsUTF8&&valueIsOfTypeString){stringToUTF8(value,ptr,length+1);}else {if(valueIsOfTypeString){for(var i=0;i<length;++i){var charCode=value.charCodeAt(i);if(charCode>255){_free(ptr);throwBindingError("String has UTF-16 code units that do not fit in 8 bits");}GROWABLE_HEAP_U8()[ptr+i]=charCode;}}else {for(var i=0;i<length;++i){GROWABLE_HEAP_U8()[ptr+i]=value[i];}}}if(destructors!==null){destructors.push(_free,base);}return base},"argPackAdvance":8,"readValueFromPointer":simpleReadValueFromPointer,destructorFunction:function(ptr){_free(ptr);}});}var UTF16Decoder=typeof TextDecoder!="undefined"?new TextDecoder("utf-16le"):undefined;function UTF16ToString(ptr,maxBytesToRead){var endPtr=ptr;var idx=endPtr>>1;var maxIdx=idx+maxBytesToRead/2;while(!(idx>=maxIdx)&&GROWABLE_HEAP_U16()[idx])++idx;endPtr=idx<<1;if(endPtr-ptr>32&&UTF16Decoder)return UTF16Decoder.decode(GROWABLE_HEAP_U8().slice(ptr,endPtr));var str="";for(var i=0;!(i>=maxBytesToRead/2);++i){var codeUnit=GROWABLE_HEAP_I16()[ptr+i*2>>1];if(codeUnit==0)break;str+=String.fromCharCode(codeUnit);}return str}function stringToUTF16(str,outPtr,maxBytesToWrite){if(maxBytesToWrite===undefined){maxBytesToWrite=2147483647;}if(maxBytesToWrite<2)return 0;maxBytesToWrite-=2;var startPtr=outPtr;var numCharsToWrite=maxBytesToWrite<str.length*2?maxBytesToWrite/2:str.length;for(var i=0;i<numCharsToWrite;++i){var codeUnit=str.charCodeAt(i);GROWABLE_HEAP_I16()[outPtr>>1]=codeUnit;outPtr+=2;}GROWABLE_HEAP_I16()[outPtr>>1]=0;return outPtr-startPtr}function lengthBytesUTF16(str){return str.length*2}function UTF32ToString(ptr,maxBytesToRead){var i=0;var str="";while(!(i>=maxBytesToRead/4)){var utf32=GROWABLE_HEAP_I32()[ptr+i*4>>2];if(utf32==0)break;++i;if(utf32>=65536){var ch=utf32-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023);}else {str+=String.fromCharCode(utf32);}}return str}function stringToUTF32(str,outPtr,maxBytesToWrite){if(maxBytesToWrite===undefined){maxBytesToWrite=2147483647;}if(maxBytesToWrite<4)return 0;var startPtr=outPtr;var endPtr=startPtr+maxBytesToWrite-4;for(var i=0;i<str.length;++i){var codeUnit=str.charCodeAt(i);if(codeUnit>=55296&&codeUnit<=57343){var trailSurrogate=str.charCodeAt(++i);codeUnit=65536+((codeUnit&1023)<<10)|trailSurrogate&1023;}GROWABLE_HEAP_I32()[outPtr>>2]=codeUnit;outPtr+=4;if(outPtr+4>endPtr)break}GROWABLE_HEAP_I32()[outPtr>>2]=0;return outPtr-startPtr}function lengthBytesUTF32(str){var len=0;for(var i=0;i<str.length;++i){var codeUnit=str.charCodeAt(i);if(codeUnit>=55296&&codeUnit<=57343)++i;len+=4;}return len}function __embind_register_std_wstring(rawType,charSize,name){name=readLatin1String(name);var decodeString,encodeString,getHeap,lengthBytesUTF,shift;if(charSize===2){decodeString=UTF16ToString;encodeString=stringToUTF16;lengthBytesUTF=lengthBytesUTF16;getHeap=()=>GROWABLE_HEAP_U16();shift=1;}else if(charSize===4){decodeString=UTF32ToString;encodeString=stringToUTF32;lengthBytesUTF=lengthBytesUTF32;getHeap=()=>GROWABLE_HEAP_U32();shift=2;}registerType(rawType,{name:name,"fromWireType":function(value){var length=GROWABLE_HEAP_U32()[value>>2];var HEAP=getHeap();var str;var decodeStartPtr=value+4;for(var i=0;i<=length;++i){var currentBytePtr=value+4+i*charSize;if(i==length||HEAP[currentBytePtr>>shift]==0){var maxReadBytes=currentBytePtr-decodeStartPtr;var stringSegment=decodeString(decodeStartPtr,maxReadBytes);if(str===undefined){str=stringSegment;}else {str+=String.fromCharCode(0);str+=stringSegment;}decodeStartPtr=currentBytePtr+charSize;}}_free(value);return str},"toWireType":function(destructors,value){if(!(typeof value=="string")){throwBindingError("Cannot pass non-string to C++ string type "+name);}var length=lengthBytesUTF(value);var ptr=_malloc(4+length+charSize);GROWABLE_HEAP_U32()[ptr>>2]=length>>shift;encodeString(value,ptr+4,length+charSize);if(destructors!==null){destructors.push(_free,ptr);}return ptr},"argPackAdvance":8,"readValueFromPointer":simpleReadValueFromPointer,destructorFunction:function(ptr){_free(ptr);}});}function __embind_register_void(rawType,name){name=readLatin1String(name);registerType(rawType,{isVoid:true,name:name,"argPackAdvance":0,"fromWireType":function(){return undefined},"toWireType":function(destructors,o){return undefined}});}function __emscripten_default_pthread_stack_size(){return 2097152}var nowIsMonotonic=true;function __emscripten_get_now_is_monotonic(){return nowIsMonotonic}function executeNotifiedProxyingQueue(queue){Atomics.store(GROWABLE_HEAP_I32(),queue>>2,1);if(_pthread_self()){__emscripten_proxy_execute_task_queue(queue);}Atomics.compareExchange(GROWABLE_HEAP_I32(),queue>>2,1,0);}Module["executeNotifiedProxyingQueue"]=executeNotifiedProxyingQueue;function __emscripten_notify_task_queue(targetThreadId,currThreadId,mainThreadId,queue){if(targetThreadId==currThreadId){setTimeout(()=>executeNotifiedProxyingQueue(queue));}else if(ENVIRONMENT_IS_PTHREAD){postMessage({"targetThread":targetThreadId,"cmd":"processProxyingQueue","queue":queue});}else {var worker=PThread.pthreads[targetThreadId];if(!worker){return}worker.postMessage({"cmd":"processProxyingQueue","queue":queue});}return 1}function __emscripten_set_offscreencanvas_size(target,width,height){return -1}var emval_symbols={};function getStringOrSymbol(address){var symbol=emval_symbols[address];if(symbol===undefined){return readLatin1String(address)}return symbol}var emval_methodCallers=[];function __emval_call_void_method(caller,handle,methodName,args){caller=emval_methodCallers[caller];handle=Emval.toValue(handle);methodName=getStringOrSymbol(methodName);caller(handle,methodName,null,args);}function emval_addMethodCaller(caller){var id=emval_methodCallers.length;emval_methodCallers.push(caller);return id}function requireRegisteredType(rawType,humanName){var impl=registeredTypes[rawType];if(undefined===impl){throwBindingError(humanName+" has unknown type "+getTypeName(rawType));}return impl}function emval_lookupTypes(argCount,argTypes){var a=new Array(argCount);for(var i=0;i<argCount;++i){a[i]=requireRegisteredType(GROWABLE_HEAP_U32()[argTypes+i*POINTER_SIZE>>2],"parameter "+i);}return a}var emval_registeredMethods=[];function __emval_get_method_caller(argCount,argTypes){var types=emval_lookupTypes(argCount,argTypes);var retType=types[0];var signatureName=retType.name+"_$"+types.slice(1).map(function(t){return t.name}).join("_")+"$";var returnId=emval_registeredMethods[signatureName];if(returnId!==undefined){return returnId}var params=["retType"];var args=[retType];var argsList="";for(var i=0;i<argCount-1;++i){argsList+=(i!==0?", ":"")+"arg"+i;params.push("argType"+i);args.push(types[1+i]);}var functionName=makeLegalFunctionName("methodCaller_"+signatureName);var functionBody="return function "+functionName+"(handle, name, destructors, args) {\n";var offset=0;for(var i=0;i<argCount-1;++i){functionBody+="    var arg"+i+" = argType"+i+".readValueFromPointer(args"+(offset?"+"+offset:"")+");\n";offset+=types[i+1]["argPackAdvance"];}functionBody+="    var rv = handle[name]("+argsList+");\n";for(var i=0;i<argCount-1;++i){if(types[i+1]["deleteObject"]){functionBody+="    argType"+i+".deleteObject(arg"+i+");\n";}}if(!retType.isVoid){functionBody+="    return retType.toWireType(destructors, rv);\n";}functionBody+="};\n";params.push(functionBody);var invokerFunction=new_(Function,params).apply(null,args);returnId=emval_addMethodCaller(invokerFunction);emval_registeredMethods[signatureName]=returnId;return returnId}function __emval_incref(handle){if(handle>4){emval_handle_array[handle].refcount+=1;}}function __emval_take_value(type,arg){type=requireRegisteredType(type,"_emval_take_value");var v=type["readValueFromPointer"](arg);return Emval.toHandle(v)}function readI53FromI64(ptr){return GROWABLE_HEAP_U32()[ptr>>2]+GROWABLE_HEAP_I32()[ptr+4>>2]*4294967296}function __gmtime_js(time,tmPtr){var date=new Date(readI53FromI64(time)*1e3);GROWABLE_HEAP_I32()[tmPtr>>2]=date.getUTCSeconds();GROWABLE_HEAP_I32()[tmPtr+4>>2]=date.getUTCMinutes();GROWABLE_HEAP_I32()[tmPtr+8>>2]=date.getUTCHours();GROWABLE_HEAP_I32()[tmPtr+12>>2]=date.getUTCDate();GROWABLE_HEAP_I32()[tmPtr+16>>2]=date.getUTCMonth();GROWABLE_HEAP_I32()[tmPtr+20>>2]=date.getUTCFullYear()-1900;GROWABLE_HEAP_I32()[tmPtr+24>>2]=date.getUTCDay();var start=Date.UTC(date.getUTCFullYear(),0,1,0,0,0,0);var yday=(date.getTime()-start)/(1e3*60*60*24)|0;GROWABLE_HEAP_I32()[tmPtr+28>>2]=yday;}function __isLeapYear(year){return year%4===0&&(year%100!==0||year%400===0)}var __MONTH_DAYS_LEAP_CUMULATIVE=[0,31,60,91,121,152,182,213,244,274,305,335];var __MONTH_DAYS_REGULAR_CUMULATIVE=[0,31,59,90,120,151,181,212,243,273,304,334];function __yday_from_date(date){var isLeapYear=__isLeapYear(date.getFullYear());var monthDaysCumulative=isLeapYear?__MONTH_DAYS_LEAP_CUMULATIVE:__MONTH_DAYS_REGULAR_CUMULATIVE;var yday=monthDaysCumulative[date.getMonth()]+date.getDate()-1;return yday}function __localtime_js(time,tmPtr){var date=new Date(readI53FromI64(time)*1e3);GROWABLE_HEAP_I32()[tmPtr>>2]=date.getSeconds();GROWABLE_HEAP_I32()[tmPtr+4>>2]=date.getMinutes();GROWABLE_HEAP_I32()[tmPtr+8>>2]=date.getHours();GROWABLE_HEAP_I32()[tmPtr+12>>2]=date.getDate();GROWABLE_HEAP_I32()[tmPtr+16>>2]=date.getMonth();GROWABLE_HEAP_I32()[tmPtr+20>>2]=date.getFullYear()-1900;GROWABLE_HEAP_I32()[tmPtr+24>>2]=date.getDay();var yday=__yday_from_date(date)|0;GROWABLE_HEAP_I32()[tmPtr+28>>2]=yday;GROWABLE_HEAP_I32()[tmPtr+36>>2]=-(date.getTimezoneOffset()*60);var start=new Date(date.getFullYear(),0,1);var summerOffset=new Date(date.getFullYear(),6,1).getTimezoneOffset();var winterOffset=start.getTimezoneOffset();var dst=(summerOffset!=winterOffset&&date.getTimezoneOffset()==Math.min(winterOffset,summerOffset))|0;GROWABLE_HEAP_I32()[tmPtr+32>>2]=dst;}function __mktime_js(tmPtr){var date=new Date(GROWABLE_HEAP_I32()[tmPtr+20>>2]+1900,GROWABLE_HEAP_I32()[tmPtr+16>>2],GROWABLE_HEAP_I32()[tmPtr+12>>2],GROWABLE_HEAP_I32()[tmPtr+8>>2],GROWABLE_HEAP_I32()[tmPtr+4>>2],GROWABLE_HEAP_I32()[tmPtr>>2],0);var dst=GROWABLE_HEAP_I32()[tmPtr+32>>2];var guessedOffset=date.getTimezoneOffset();var start=new Date(date.getFullYear(),0,1);var summerOffset=new Date(date.getFullYear(),6,1).getTimezoneOffset();var winterOffset=start.getTimezoneOffset();var dstOffset=Math.min(winterOffset,summerOffset);if(dst<0){GROWABLE_HEAP_I32()[tmPtr+32>>2]=Number(summerOffset!=winterOffset&&dstOffset==guessedOffset);}else if(dst>0!=(dstOffset==guessedOffset)){var nonDstOffset=Math.max(winterOffset,summerOffset);var trueOffset=dst>0?dstOffset:nonDstOffset;date.setTime(date.getTime()+(trueOffset-guessedOffset)*6e4);}GROWABLE_HEAP_I32()[tmPtr+24>>2]=date.getDay();var yday=__yday_from_date(date)|0;GROWABLE_HEAP_I32()[tmPtr+28>>2]=yday;GROWABLE_HEAP_I32()[tmPtr>>2]=date.getSeconds();GROWABLE_HEAP_I32()[tmPtr+4>>2]=date.getMinutes();GROWABLE_HEAP_I32()[tmPtr+8>>2]=date.getHours();GROWABLE_HEAP_I32()[tmPtr+12>>2]=date.getDate();GROWABLE_HEAP_I32()[tmPtr+16>>2]=date.getMonth();GROWABLE_HEAP_I32()[tmPtr+20>>2]=date.getYear();return date.getTime()/1e3|0}function __mmap_js(len,prot,flags,fd,off,allocated,addr){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(13,1,len,prot,flags,fd,off,allocated,addr);try{var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,off,prot,flags);var ptr=res.ptr;GROWABLE_HEAP_I32()[allocated>>2]=res.allocated;GROWABLE_HEAP_U32()[addr>>2]=ptr;return 0}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(14,1,addr,len,prot,flags,fd,offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset);}FS.munmap(stream);}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return -e.errno}}function allocateUTF8(str){var size=lengthBytesUTF8(str)+1;var ret=_malloc(size);if(ret)stringToUTF8Array(str,GROWABLE_HEAP_I8(),ret,size);return ret}function __tzset_js(timezone,daylight,tzname){var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);GROWABLE_HEAP_U32()[timezone>>2]=stdTimezoneOffset*60;GROWABLE_HEAP_I32()[daylight>>2]=Number(winterOffset!=summerOffset);function extractZone(date){var match=date.toTimeString().match(/\(([A-Za-z ]+)\)$/);return match?match[1]:"GMT"}var winterName=extractZone(winter);var summerName=extractZone(summer);var winterNamePtr=allocateUTF8(winterName);var summerNamePtr=allocateUTF8(summerName);if(summerOffset<winterOffset){GROWABLE_HEAP_U32()[tzname>>2]=winterNamePtr;GROWABLE_HEAP_U32()[tzname+4>>2]=summerNamePtr;}else {GROWABLE_HEAP_U32()[tzname>>2]=summerNamePtr;GROWABLE_HEAP_U32()[tzname+4>>2]=winterNamePtr;}}function _abort(){abort("");}var readAsmConstArgsArray=[];function readAsmConstArgs(sigPtr,buf){readAsmConstArgsArray.length=0;var ch;buf>>=2;while(ch=GROWABLE_HEAP_U8()[sigPtr++]){buf+=ch!=105&buf;readAsmConstArgsArray.push(ch==105?GROWABLE_HEAP_I32()[buf]:GROWABLE_HEAP_F64()[buf++>>1]);++buf;}return readAsmConstArgsArray}function _emscripten_asm_const_int(code,sigPtr,argbuf){var args=readAsmConstArgs(sigPtr,argbuf);return ASM_CONSTS[code].apply(null,args)}function _emscripten_check_blocking_allowed(){if(ENVIRONMENT_IS_NODE)return;if(ENVIRONMENT_IS_WORKER)return;warnOnce("Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread");}function _emscripten_date_now(){return Date.now()}function getHeapMax(){return 2147483648}function _emscripten_get_heap_max(){return getHeapMax()}function _emscripten_memcpy_big(dest,src,num){GROWABLE_HEAP_U8().copyWithin(dest,src,src+num);}function _emscripten_num_logical_cores(){if(ENVIRONMENT_IS_NODE)return require("os").cpus().length;return navigator["hardwareConcurrency"]}function withStackSave(f){var stack=stackSave();var ret=f();stackRestore(stack);return ret}function _emscripten_proxy_to_main_thread_js(index,sync){var numCallArgs=arguments.length-2;var outerArgs=arguments;return withStackSave(()=>{var serializedNumCallArgs=numCallArgs;var args=stackAlloc(serializedNumCallArgs*8);var b=args>>3;for(var i=0;i<numCallArgs;i++){var arg=outerArgs[2+i];GROWABLE_HEAP_F64()[b+i]=arg;}return _emscripten_run_in_main_runtime_thread_js(index,serializedNumCallArgs,args,sync)})}var _emscripten_receive_on_main_thread_js_callArgs=[];function _emscripten_receive_on_main_thread_js(index,numCallArgs,args){_emscripten_receive_on_main_thread_js_callArgs.length=numCallArgs;var b=args>>3;for(var i=0;i<numCallArgs;i++){_emscripten_receive_on_main_thread_js_callArgs[i]=GROWABLE_HEAP_F64()[b+i];}var isEmAsmConst=index<0;var func=!isEmAsmConst?proxiedFunctionTable[index]:ASM_CONSTS[-index-1];return func.apply(null,_emscripten_receive_on_main_thread_js_callArgs)}function emscripten_realloc_buffer(size){try{wasmMemory.grow(size-buffer.byteLength+65535>>>16);updateGlobalBufferAndViews(wasmMemory.buffer);return 1}catch(e){}}function _emscripten_resize_heap(requestedSize){var oldSize=GROWABLE_HEAP_U8().length;requestedSize=requestedSize>>>0;if(requestedSize<=oldSize){return false}var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}let alignUp=(x,multiple)=>x+(multiple-x%multiple)%multiple;for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignUp(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=emscripten_realloc_buffer(newSize);if(replacement){return true}}return false}function convertFrameToPC(frame){abort("Cannot use convertFrameToPC (needed by __builtin_return_address) without -sUSE_OFFSET_CONVERTER");return 0}var UNWIND_CACHE={};function saveInUnwindCache(callstack){callstack.forEach(frame=>{convertFrameToPC();});}function _emscripten_stack_snapshot(){var callstack=jsStackTrace().split("\n");if(callstack[0]=="Error"){callstack.shift();}saveInUnwindCache(callstack);UNWIND_CACHE.last_addr=convertFrameToPC(callstack[3]);UNWIND_CACHE.last_stack=callstack;return UNWIND_CACHE.last_addr}function _emscripten_stack_unwind_buffer(addr,buffer,count){var stack;if(UNWIND_CACHE.last_addr==addr){stack=UNWIND_CACHE.last_stack;}else {stack=jsStackTrace().split("\n");if(stack[0]=="Error"){stack.shift();}saveInUnwindCache(stack);}var offset=3;while(stack[offset]&&convertFrameToPC(stack[offset])!=addr){++offset;}for(var i=0;i<count&&stack[i+offset];++i){GROWABLE_HEAP_I32()[buffer+i*4>>2]=convertFrameToPC(stack[i+offset]);}return i}function _emscripten_unwind_to_js_event_loop(){throw "unwind"}var ENV={};function getExecutableName(){return thisProgram||"./this.program"}function getEnvStrings(){if(!getEnvStrings.strings){var lang=(typeof navigator=="object"&&navigator.languages&&navigator.languages[0]||"C").replace("-","_")+".UTF-8";var env={"USER":"web_user","LOGNAME":"web_user","PATH":"/","PWD":"/","HOME":"/home/web_user","LANG":lang,"_":getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x];}var strings=[];for(var x in env){strings.push(x+"="+env[x]);}getEnvStrings.strings=strings;}return getEnvStrings.strings}function writeAsciiToMemory(str,buffer,dontAddNull){for(var i=0;i<str.length;++i){GROWABLE_HEAP_I8()[buffer++>>0]=str.charCodeAt(i);}if(!dontAddNull)GROWABLE_HEAP_I8()[buffer>>0]=0;}function _environ_get(__environ,environ_buf){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(15,1,__environ,environ_buf);var bufSize=0;getEnvStrings().forEach(function(string,i){var ptr=environ_buf+bufSize;GROWABLE_HEAP_U32()[__environ+i*4>>2]=ptr;writeAsciiToMemory(string,ptr);bufSize+=string.length+1;});return 0}function _environ_sizes_get(penviron_count,penviron_buf_size){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(16,1,penviron_count,penviron_buf_size);var strings=getEnvStrings();GROWABLE_HEAP_U32()[penviron_count>>2]=strings.length;var bufSize=0;strings.forEach(function(string){bufSize+=string.length+1;});GROWABLE_HEAP_U32()[penviron_buf_size>>2]=bufSize;return 0}function _fd_close(fd){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(17,1,fd);try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return e.errno}}function doReadv(stream,iov,iovcnt,offset){var ret=0;for(var i=0;i<iovcnt;i++){var ptr=GROWABLE_HEAP_U32()[iov>>2];var len=GROWABLE_HEAP_U32()[iov+4>>2];iov+=8;var curr=FS.read(stream,GROWABLE_HEAP_I8(),ptr,len,offset);if(curr<0)return -1;ret+=curr;if(curr<len)break}return ret}function _fd_read(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(18,1,fd,iov,iovcnt,pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);GROWABLE_HEAP_U32()[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return e.errno}}function convertI32PairToI53Checked(lo,hi){return hi+2097152>>>0<4194305-!!lo?(lo>>>0)+hi*4294967296:NaN}function _fd_seek(fd,offset_low,offset_high,whence,newOffset){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(19,1,fd,offset_low,offset_high,whence,newOffset);try{var offset=convertI32PairToI53Checked(offset_low,offset_high);if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);tempI64=[stream.position>>>0,(tempDouble=stream.position,+Math.abs(tempDouble)>=1?tempDouble>0?(Math.min(+Math.floor(tempDouble/4294967296),4294967295)|0)>>>0:~~+Math.ceil((tempDouble-+(~~tempDouble>>>0))/4294967296)>>>0:0)],GROWABLE_HEAP_I32()[newOffset>>2]=tempI64[0],GROWABLE_HEAP_I32()[newOffset+4>>2]=tempI64[1];if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return e.errno}}function doWritev(stream,iov,iovcnt,offset){var ret=0;for(var i=0;i<iovcnt;i++){var ptr=GROWABLE_HEAP_U32()[iov>>2];var len=GROWABLE_HEAP_U32()[iov+4>>2];iov+=8;var curr=FS.write(stream,GROWABLE_HEAP_I8(),ptr,len,offset);if(curr<0)return -1;ret+=curr;}return ret}function _fd_write(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return _emscripten_proxy_to_main_thread_js(20,1,fd,iov,iovcnt,pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);GROWABLE_HEAP_U32()[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e instanceof FS.ErrnoError))throw e;return e.errno}}function _getentropy(buffer,size){if(!_getentropy.randomDevice){_getentropy.randomDevice=getRandomDevice();}for(var i=0;i<size;i++){GROWABLE_HEAP_I8()[buffer+i>>0]=_getentropy.randomDevice();}return 0}function __arraySum(array,index){var sum=0;for(var i=0;i<=index;sum+=array[i++]){}return sum}var __MONTH_DAYS_LEAP=[31,29,31,30,31,30,31,31,30,31,30,31];var __MONTH_DAYS_REGULAR=[31,28,31,30,31,30,31,31,30,31,30,31];function __addDays(date,days){var newDate=new Date(date.getTime());while(days>0){var leap=__isLeapYear(newDate.getFullYear());var currentMonth=newDate.getMonth();var daysInCurrentMonth=(leap?__MONTH_DAYS_LEAP:__MONTH_DAYS_REGULAR)[currentMonth];if(days>daysInCurrentMonth-newDate.getDate()){days-=daysInCurrentMonth-newDate.getDate()+1;newDate.setDate(1);if(currentMonth<11){newDate.setMonth(currentMonth+1);}else {newDate.setMonth(0);newDate.setFullYear(newDate.getFullYear()+1);}}else {newDate.setDate(newDate.getDate()+days);return newDate}}return newDate}function writeArrayToMemory(array,buffer){GROWABLE_HEAP_I8().set(array,buffer);}function _strftime(s,maxsize,format,tm){var tm_zone=GROWABLE_HEAP_I32()[tm+40>>2];var date={tm_sec:GROWABLE_HEAP_I32()[tm>>2],tm_min:GROWABLE_HEAP_I32()[tm+4>>2],tm_hour:GROWABLE_HEAP_I32()[tm+8>>2],tm_mday:GROWABLE_HEAP_I32()[tm+12>>2],tm_mon:GROWABLE_HEAP_I32()[tm+16>>2],tm_year:GROWABLE_HEAP_I32()[tm+20>>2],tm_wday:GROWABLE_HEAP_I32()[tm+24>>2],tm_yday:GROWABLE_HEAP_I32()[tm+28>>2],tm_isdst:GROWABLE_HEAP_I32()[tm+32>>2],tm_gmtoff:GROWABLE_HEAP_I32()[tm+36>>2],tm_zone:tm_zone?UTF8ToString(tm_zone):""};var pattern=UTF8ToString(format);var EXPANSION_RULES_1={"%c":"%a %b %d %H:%M:%S %Y","%D":"%m/%d/%y","%F":"%Y-%m-%d","%h":"%b","%r":"%I:%M:%S %p","%R":"%H:%M","%T":"%H:%M:%S","%x":"%m/%d/%y","%X":"%H:%M:%S","%Ec":"%c","%EC":"%C","%Ex":"%m/%d/%y","%EX":"%H:%M:%S","%Ey":"%y","%EY":"%Y","%Od":"%d","%Oe":"%e","%OH":"%H","%OI":"%I","%Om":"%m","%OM":"%M","%OS":"%S","%Ou":"%u","%OU":"%U","%OV":"%V","%Ow":"%w","%OW":"%W","%Oy":"%y"};for(var rule in EXPANSION_RULES_1){pattern=pattern.replace(new RegExp(rule,"g"),EXPANSION_RULES_1[rule]);}var WEEKDAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];var MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];function leadingSomething(value,digits,character){var str=typeof value=="number"?value.toString():value||"";while(str.length<digits){str=character[0]+str;}return str}function leadingNulls(value,digits){return leadingSomething(value,digits,"0")}function compareByDay(date1,date2){function sgn(value){return value<0?-1:value>0?1:0}var compare;if((compare=sgn(date1.getFullYear()-date2.getFullYear()))===0){if((compare=sgn(date1.getMonth()-date2.getMonth()))===0){compare=sgn(date1.getDate()-date2.getDate());}}return compare}function getFirstWeekStartDate(janFourth){switch(janFourth.getDay()){case 0:return new Date(janFourth.getFullYear()-1,11,29);case 1:return janFourth;case 2:return new Date(janFourth.getFullYear(),0,3);case 3:return new Date(janFourth.getFullYear(),0,2);case 4:return new Date(janFourth.getFullYear(),0,1);case 5:return new Date(janFourth.getFullYear()-1,11,31);case 6:return new Date(janFourth.getFullYear()-1,11,30)}}function getWeekBasedYear(date){var thisDate=__addDays(new Date(date.tm_year+1900,0,1),date.tm_yday);var janFourthThisYear=new Date(thisDate.getFullYear(),0,4);var janFourthNextYear=new Date(thisDate.getFullYear()+1,0,4);var firstWeekStartThisYear=getFirstWeekStartDate(janFourthThisYear);var firstWeekStartNextYear=getFirstWeekStartDate(janFourthNextYear);if(compareByDay(firstWeekStartThisYear,thisDate)<=0){if(compareByDay(firstWeekStartNextYear,thisDate)<=0){return thisDate.getFullYear()+1}return thisDate.getFullYear()}return thisDate.getFullYear()-1}var EXPANSION_RULES_2={"%a":function(date){return WEEKDAYS[date.tm_wday].substring(0,3)},"%A":function(date){return WEEKDAYS[date.tm_wday]},"%b":function(date){return MONTHS[date.tm_mon].substring(0,3)},"%B":function(date){return MONTHS[date.tm_mon]},"%C":function(date){var year=date.tm_year+1900;return leadingNulls(year/100|0,2)},"%d":function(date){return leadingNulls(date.tm_mday,2)},"%e":function(date){return leadingSomething(date.tm_mday,2," ")},"%g":function(date){return getWeekBasedYear(date).toString().substring(2)},"%G":function(date){return getWeekBasedYear(date)},"%H":function(date){return leadingNulls(date.tm_hour,2)},"%I":function(date){var twelveHour=date.tm_hour;if(twelveHour==0)twelveHour=12;else if(twelveHour>12)twelveHour-=12;return leadingNulls(twelveHour,2)},"%j":function(date){return leadingNulls(date.tm_mday+__arraySum(__isLeapYear(date.tm_year+1900)?__MONTH_DAYS_LEAP:__MONTH_DAYS_REGULAR,date.tm_mon-1),3)},"%m":function(date){return leadingNulls(date.tm_mon+1,2)},"%M":function(date){return leadingNulls(date.tm_min,2)},"%n":function(){return "\n"},"%p":function(date){if(date.tm_hour>=0&&date.tm_hour<12){return "AM"}return "PM"},"%S":function(date){return leadingNulls(date.tm_sec,2)},"%t":function(){return "\t"},"%u":function(date){return date.tm_wday||7},"%U":function(date){var days=date.tm_yday+7-date.tm_wday;return leadingNulls(Math.floor(days/7),2)},"%V":function(date){var val=Math.floor((date.tm_yday+7-(date.tm_wday+6)%7)/7);if((date.tm_wday+371-date.tm_yday-2)%7<=2){val++;}if(!val){val=52;var dec31=(date.tm_wday+7-date.tm_yday-1)%7;if(dec31==4||dec31==5&&__isLeapYear(date.tm_year%400-1)){val++;}}else if(val==53){var jan1=(date.tm_wday+371-date.tm_yday)%7;if(jan1!=4&&(jan1!=3||!__isLeapYear(date.tm_year)))val=1;}return leadingNulls(val,2)},"%w":function(date){return date.tm_wday},"%W":function(date){var days=date.tm_yday+7-(date.tm_wday+6)%7;return leadingNulls(Math.floor(days/7),2)},"%y":function(date){return (date.tm_year+1900).toString().substring(2)},"%Y":function(date){return date.tm_year+1900},"%z":function(date){var off=date.tm_gmtoff;var ahead=off>=0;off=Math.abs(off)/60;off=off/60*100+off%60;return (ahead?"+":"-")+String("0000"+off).slice(-4)},"%Z":function(date){return date.tm_zone},"%%":function(){return "%"}};pattern=pattern.replace(/%%/g,"\0\0");for(var rule in EXPANSION_RULES_2){if(pattern.includes(rule)){pattern=pattern.replace(new RegExp(rule,"g"),EXPANSION_RULES_2[rule](date));}}pattern=pattern.replace(/\0\0/g,"%");var bytes=intArrayFromString(pattern,false);if(bytes.length>maxsize){return 0}writeArrayToMemory(bytes,s);return bytes.length-1}function _strftime_l(s,maxsize,format,tm,loc){return _strftime(s,maxsize,format,tm)}Module["requestFullscreen"]=function Module_requestFullscreen(lockPointer,resizeCanvas){Browser.requestFullscreen(lockPointer,resizeCanvas);};Module["requestAnimationFrame"]=function Module_requestAnimationFrame(func){Browser.requestAnimationFrame(func);};Module["setCanvasSize"]=function Module_setCanvasSize(width,height,noUpdates){Browser.setCanvasSize(width,height,noUpdates);};Module["pauseMainLoop"]=function Module_pauseMainLoop(){Browser.mainLoop.pause();};Module["resumeMainLoop"]=function Module_resumeMainLoop(){Browser.mainLoop.resume();};Module["getUserMedia"]=function Module_getUserMedia(){Browser.getUserMedia();};Module["createContext"]=function Module_createContext(canvas,useWebGL,setInModule,webGLContextAttributes){return Browser.createContext(canvas,useWebGL,setInModule,webGLContextAttributes)};var FSNode=function(parent,name,mode,rdev){if(!parent){parent=this;}this.parent=parent;this.mount=parent.mount;this.mounted=null;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.node_ops={};this.stream_ops={};this.rdev=rdev;};var readMode=292|73;var writeMode=146;Object.defineProperties(FSNode.prototype,{read:{get:function(){return (this.mode&readMode)===readMode},set:function(val){val?this.mode|=readMode:this.mode&=~readMode;}},write:{get:function(){return (this.mode&writeMode)===writeMode},set:function(val){val?this.mode|=writeMode:this.mode&=~writeMode;}},isFolder:{get:function(){return FS.isDir(this.mode)}},isDevice:{get:function(){return FS.isChrdev(this.mode)}}});FS.FSNode=FSNode;FS.staticInit();Module["FS_createPath"]=FS.createPath;Module["FS_createDataFile"]=FS.createDataFile;Module["FS_createPreloadedFile"]=FS.createPreloadedFile;Module["FS_unlink"]=FS.unlink;Module["FS_createLazyFile"]=FS.createLazyFile;Module["FS_createDevice"]=FS.createDevice;PThread.init();embind_init_charCodes();BindingError=Module["BindingError"]=extendError(Error,"BindingError");InternalError=Module["InternalError"]=extendError(Error,"InternalError");init_ClassHandle();init_embind();init_RegisteredPointer();UnboundTypeError=Module["UnboundTypeError"]=extendError(Error,"UnboundTypeError");init_emval();var proxiedFunctionTable=[null,_proc_exit,exitOnMainThread,pthreadCreateProxied,___syscall_fcntl64,___syscall_fstat64,___syscall_getdents64,___syscall_ioctl,___syscall_lstat64,___syscall_newfstatat,___syscall_openat,___syscall_stat64,___syscall_unlinkat,__mmap_js,__munmap_js,_environ_get,_environ_sizes_get,_fd_close,_fd_read,_fd_seek,_fd_write];var asmLibraryArg={"HaveOffsetConverter":HaveOffsetConverter,"_Unwind_Backtrace":__Unwind_Backtrace,"_Unwind_GetIP":__Unwind_GetIP,"__emscripten_init_main_thread_js":___emscripten_init_main_thread_js,"__emscripten_thread_cleanup":___emscripten_thread_cleanup,"__pthread_create_js":___pthread_create_js,"__syscall_fcntl64":___syscall_fcntl64,"__syscall_fstat64":___syscall_fstat64,"__syscall_getdents64":___syscall_getdents64,"__syscall_ioctl":___syscall_ioctl,"__syscall_lstat64":___syscall_lstat64,"__syscall_newfstatat":___syscall_newfstatat,"__syscall_openat":___syscall_openat,"__syscall_stat64":___syscall_stat64,"__syscall_unlinkat":___syscall_unlinkat,"_dlinit":__dlinit,"_dlopen_js":__dlopen_js,"_dlsym_js":__dlsym_js,"_embind_register_bigint":__embind_register_bigint,"_embind_register_bool":__embind_register_bool,"_embind_register_class":__embind_register_class,"_embind_register_class_class_function":__embind_register_class_class_function,"_embind_register_class_constructor":__embind_register_class_constructor,"_embind_register_class_function":__embind_register_class_function,"_embind_register_emval":__embind_register_emval,"_embind_register_float":__embind_register_float,"_embind_register_function":__embind_register_function,"_embind_register_integer":__embind_register_integer,"_embind_register_memory_view":__embind_register_memory_view,"_embind_register_std_string":__embind_register_std_string,"_embind_register_std_wstring":__embind_register_std_wstring,"_embind_register_void":__embind_register_void,"_emscripten_default_pthread_stack_size":__emscripten_default_pthread_stack_size,"_emscripten_get_now_is_monotonic":__emscripten_get_now_is_monotonic,"_emscripten_notify_task_queue":__emscripten_notify_task_queue,"_emscripten_set_offscreencanvas_size":__emscripten_set_offscreencanvas_size,"_emval_call_void_method":__emval_call_void_method,"_emval_decref":__emval_decref,"_emval_get_method_caller":__emval_get_method_caller,"_emval_incref":__emval_incref,"_emval_take_value":__emval_take_value,"_gmtime_js":__gmtime_js,"_localtime_js":__localtime_js,"_mktime_js":__mktime_js,"_mmap_js":__mmap_js,"_munmap_js":__munmap_js,"_tzset_js":__tzset_js,"abort":_abort,"emscripten_asm_const_int":_emscripten_asm_const_int,"emscripten_check_blocking_allowed":_emscripten_check_blocking_allowed,"emscripten_date_now":_emscripten_date_now,"emscripten_get_heap_max":_emscripten_get_heap_max,"emscripten_get_now":_emscripten_get_now,"emscripten_memcpy_big":_emscripten_memcpy_big,"emscripten_num_logical_cores":_emscripten_num_logical_cores,"emscripten_receive_on_main_thread_js":_emscripten_receive_on_main_thread_js,"emscripten_resize_heap":_emscripten_resize_heap,"emscripten_stack_snapshot":_emscripten_stack_snapshot,"emscripten_stack_unwind_buffer":_emscripten_stack_unwind_buffer,"emscripten_unwind_to_js_event_loop":_emscripten_unwind_to_js_event_loop,"environ_get":_environ_get,"environ_sizes_get":_environ_sizes_get,"exit":_exit,"fd_close":_fd_close,"fd_read":_fd_read,"fd_seek":_fd_seek,"fd_write":_fd_write,"getentropy":_getentropy,"memory":wasmMemory||Module["wasmMemory"],"strftime_l":_strftime_l};createWasm();Module["___wasm_call_ctors"]=function(){return (Module["___wasm_call_ctors"]=Module["asm"]["__wasm_call_ctors"]).apply(null,arguments)};var ___errno_location=Module["___errno_location"]=function(){return (___errno_location=Module["___errno_location"]=Module["asm"]["__errno_location"]).apply(null,arguments)};var _malloc=Module["_malloc"]=function(){return (_malloc=Module["_malloc"]=Module["asm"]["malloc"]).apply(null,arguments)};var _free=Module["_free"]=function(){return (_free=Module["_free"]=Module["asm"]["free"]).apply(null,arguments)};var _pthread_self=Module["_pthread_self"]=function(){return (_pthread_self=Module["_pthread_self"]=Module["asm"]["pthread_self"]).apply(null,arguments)};Module["__emscripten_tls_init"]=function(){return (Module["__emscripten_tls_init"]=Module["asm"]["_emscripten_tls_init"]).apply(null,arguments)};var _emscripten_builtin_memalign=Module["_emscripten_builtin_memalign"]=function(){return (_emscripten_builtin_memalign=Module["_emscripten_builtin_memalign"]=Module["asm"]["emscripten_builtin_memalign"]).apply(null,arguments)};var ___getTypeName=Module["___getTypeName"]=function(){return (___getTypeName=Module["___getTypeName"]=Module["asm"]["__getTypeName"]).apply(null,arguments)};Module["__embind_initialize_bindings"]=function(){return (Module["__embind_initialize_bindings"]=Module["asm"]["_embind_initialize_bindings"]).apply(null,arguments)};Module["___dl_seterr"]=function(){return (Module["___dl_seterr"]=Module["asm"]["__dl_seterr"]).apply(null,arguments)};var __emscripten_thread_init=Module["__emscripten_thread_init"]=function(){return (__emscripten_thread_init=Module["__emscripten_thread_init"]=Module["asm"]["_emscripten_thread_init"]).apply(null,arguments)};Module["__emscripten_thread_crashed"]=function(){return (Module["__emscripten_thread_crashed"]=Module["asm"]["_emscripten_thread_crashed"]).apply(null,arguments)};Module["_emscripten_main_thread_process_queued_calls"]=function(){return (Module["_emscripten_main_thread_process_queued_calls"]=Module["asm"]["emscripten_main_thread_process_queued_calls"]).apply(null,arguments)};Module["_emscripten_main_browser_thread_id"]=function(){return (Module["_emscripten_main_browser_thread_id"]=Module["asm"]["emscripten_main_browser_thread_id"]).apply(null,arguments)};var _emscripten_run_in_main_runtime_thread_js=Module["_emscripten_run_in_main_runtime_thread_js"]=function(){return (_emscripten_run_in_main_runtime_thread_js=Module["_emscripten_run_in_main_runtime_thread_js"]=Module["asm"]["emscripten_run_in_main_runtime_thread_js"]).apply(null,arguments)};Module["_emscripten_dispatch_to_thread_"]=function(){return (Module["_emscripten_dispatch_to_thread_"]=Module["asm"]["emscripten_dispatch_to_thread_"]).apply(null,arguments)};var __emscripten_proxy_execute_task_queue=Module["__emscripten_proxy_execute_task_queue"]=function(){return (__emscripten_proxy_execute_task_queue=Module["__emscripten_proxy_execute_task_queue"]=Module["asm"]["_emscripten_proxy_execute_task_queue"]).apply(null,arguments)};var __emscripten_thread_free_data=Module["__emscripten_thread_free_data"]=function(){return (__emscripten_thread_free_data=Module["__emscripten_thread_free_data"]=Module["asm"]["_emscripten_thread_free_data"]).apply(null,arguments)};var __emscripten_thread_exit=Module["__emscripten_thread_exit"]=function(){return (__emscripten_thread_exit=Module["__emscripten_thread_exit"]=Module["asm"]["_emscripten_thread_exit"]).apply(null,arguments)};var _emscripten_stack_set_limits=Module["_emscripten_stack_set_limits"]=function(){return (_emscripten_stack_set_limits=Module["_emscripten_stack_set_limits"]=Module["asm"]["emscripten_stack_set_limits"]).apply(null,arguments)};var stackSave=Module["stackSave"]=function(){return (stackSave=Module["stackSave"]=Module["asm"]["stackSave"]).apply(null,arguments)};var stackRestore=Module["stackRestore"]=function(){return (stackRestore=Module["stackRestore"]=Module["asm"]["stackRestore"]).apply(null,arguments)};var stackAlloc=Module["stackAlloc"]=function(){return (stackAlloc=Module["stackAlloc"]=Module["asm"]["stackAlloc"]).apply(null,arguments)};Module["dynCall_jjj"]=function(){return (Module["dynCall_jjj"]=Module["asm"]["dynCall_jjj"]).apply(null,arguments)};Module["dynCall_jiii"]=function(){return (Module["dynCall_jiii"]=Module["asm"]["dynCall_jiii"]).apply(null,arguments)};Module["dynCall_iiiijj"]=function(){return (Module["dynCall_iiiijj"]=Module["asm"]["dynCall_iiiijj"]).apply(null,arguments)};Module["dynCall_viijj"]=function(){return (Module["dynCall_viijj"]=Module["asm"]["dynCall_viijj"]).apply(null,arguments)};Module["dynCall_viiijjjj"]=function(){return (Module["dynCall_viiijjjj"]=Module["asm"]["dynCall_viiijjjj"]).apply(null,arguments)};Module["dynCall_jii"]=function(){return (Module["dynCall_jii"]=Module["asm"]["dynCall_jii"]).apply(null,arguments)};Module["dynCall_viji"]=function(){return (Module["dynCall_viji"]=Module["asm"]["dynCall_viji"]).apply(null,arguments)};Module["dynCall_ji"]=function(){return (Module["dynCall_ji"]=Module["asm"]["dynCall_ji"]).apply(null,arguments)};Module["dynCall_vj"]=function(){return (Module["dynCall_vj"]=Module["asm"]["dynCall_vj"]).apply(null,arguments)};Module["dynCall_viij"]=function(){return (Module["dynCall_viij"]=Module["asm"]["dynCall_viij"]).apply(null,arguments)};Module["dynCall_vij"]=function(){return (Module["dynCall_vij"]=Module["asm"]["dynCall_vij"]).apply(null,arguments)};Module["dynCall_viijii"]=function(){return (Module["dynCall_viijii"]=Module["asm"]["dynCall_viijii"]).apply(null,arguments)};Module["dynCall_iijjiiii"]=function(){return (Module["dynCall_iijjiiii"]=Module["asm"]["dynCall_iijjiiii"]).apply(null,arguments)};Module["dynCall_jiji"]=function(){return (Module["dynCall_jiji"]=Module["asm"]["dynCall_jiji"]).apply(null,arguments)};Module["dynCall_iiiiij"]=function(){return (Module["dynCall_iiiiij"]=Module["asm"]["dynCall_iiiiij"]).apply(null,arguments)};Module["dynCall_iiiiijj"]=function(){return (Module["dynCall_iiiiijj"]=Module["asm"]["dynCall_iiiiijj"]).apply(null,arguments)};Module["dynCall_iiiiiijj"]=function(){return (Module["dynCall_iiiiiijj"]=Module["asm"]["dynCall_iiiiiijj"]).apply(null,arguments)};Module["___start_em_js"]=209657;Module["___stop_em_js"]=209718;Module["addRunDependency"]=addRunDependency;Module["removeRunDependency"]=removeRunDependency;Module["FS_createPath"]=FS.createPath;Module["FS_createDataFile"]=FS.createDataFile;Module["FS_createPreloadedFile"]=FS.createPreloadedFile;Module["FS_createLazyFile"]=FS.createLazyFile;Module["FS_createDevice"]=FS.createDevice;Module["FS_unlink"]=FS.unlink;Module["keepRuntimeAlive"]=keepRuntimeAlive;Module["wasmMemory"]=wasmMemory;Module["ExitStatus"]=ExitStatus;Module["PThread"]=PThread;var calledRun;dependenciesFulfilled=function runCaller(){if(!calledRun)run();if(!calledRun)dependenciesFulfilled=runCaller;};function run(args){if(runDependencies>0){return}if(ENVIRONMENT_IS_PTHREAD){readyPromiseResolve(Module);initRuntime();postMessage({"cmd":"loaded"});return}preRun();if(runDependencies>0){return}function doRun(){if(calledRun)return;calledRun=true;Module["calledRun"]=true;if(ABORT)return;initRuntime();readyPromiseResolve(Module);if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();postRun();}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(function(){setTimeout(function(){Module["setStatus"]("");},1);doRun();},1);}else {doRun();}}if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].pop()();}}run();


	  return LyraWasmModule.ready
	}
	);
	})();

	const MEMFS_MODEL_PATH = "/tmp/";
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
	const FRAME_DURATION_MS = 20;
	/**
	 * Lyra 用の WebAssembly ファイルやモデルファイルを管理するためのクラス
	 */
	class LyraModule {
	    wasmModule;
	    constructor(wasmModule) {
	        this.wasmModule = wasmModule;
	    }
	    /**
	     * Lyra の WebAssembly ファイルやモデルファイルをロードして {@link LyraModule} のインスタンスを生成する
	     *
	     * @param wasmPath lyra.wasm および lyra.worker.js が配置されているディレクトリのパスないし URL
	     * @param modelPath Lyra 用の *.binarypb および *.tflite が配置されているディレクトリのパスないし URL
	     * @returns 生成された {@link LyraModule} インスタンス
	     */
	    static async load(wasmPath, modelPath) {
	        const wasmModule = await LyraWasmModule({
	            locateFile: (path) => {
	                return trimLastSlash(wasmPath) + "/" + path;
	            },
	            preRun: (wasmModule) => {
	                const fileNames = ["lyra_config.binarypb", "soundstream_encoder.tflite", "quantizer.tflite", "lyragan.tflite"];
	                for (const fileName of fileNames) {
	                    const url = trimLastSlash(modelPath) + "/" + fileName;
	                    wasmModule.FS_createPreloadedFile(MEMFS_MODEL_PATH, fileName, url, true, false);
	                }
	            },
	        });
	        return new LyraModule(wasmModule);
	    }
	    /**
	     * {@link LyraEncoder} のインスタンスを生成する
	     *
	     * 生成したインスタンスが不要になったら {@link LyraEncoder.destroy} メソッドを呼び出してリソースを解放すること
	     *
	     * @params options エンコーダに指定するオプション
	     * @returns 生成された {@link LyraEncoder} インスタンス
	     */
	    createEncoder(options = {}) {
	        checkSampleRate(options.sampleRate);
	        checkNumberOfChannels(options.numberOfChannels);
	        checkBitrate(options.bitrate);
	        const encoder = this.wasmModule.LyraEncoder.create(options.sampleRate || DEFAULT_SAMPLE_RATE, options.numberOfChannels || DEFAULT_CHANNELS, options.bitrate || DEFAULT_BITRATE, options.enableDtx || DEFAULT_ENABLE_DTX, MEMFS_MODEL_PATH);
	        if (encoder === undefined) {
	            throw new Error("failed to create lyra encoder");
	        }
	        else {
	            const frameSize = ((options.sampleRate || DEFAULT_SAMPLE_RATE) * FRAME_DURATION_MS) / 1000;
	            const buffer = this.wasmModule.newAudioData(frameSize);
	            return new LyraEncoder(this.wasmModule, encoder, buffer, options);
	        }
	    }
	    /**
	     * {@link LyraDecoder} のインスタンスを生成する
	     *
	     * 生成したインスタンスが不要になったら {@link LyraDecoder.destroy} メソッドを呼び出してリソースを解放すること
	     *
	     * @params options デコーダに指定するオプション
	     * @returns 生成された {@link LyraDecoder} インスタンス
	     */
	    createDecoder(options = {}) {
	        checkSampleRate(options.sampleRate);
	        checkNumberOfChannels(options.numberOfChannels);
	        const decoder = this.wasmModule.LyraDecoder.create(options.sampleRate || DEFAULT_SAMPLE_RATE, options.numberOfChannels || DEFAULT_CHANNELS, MEMFS_MODEL_PATH);
	        if (decoder === undefined) {
	            throw new Error("failed to create lyra decoder");
	        }
	        else {
	            const buffer = this.wasmModule.newBytes();
	            return new LyraDecoder(this.wasmModule, decoder, buffer, options);
	        }
	    }
	}
	/**
	 * Lyra のエンコーダ
	 */
	class LyraEncoder {
	    wasmModule;
	    encoder;
	    buffer;
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
	    constructor(wasmModule, encoder, buffer, options) {
	        this.wasmModule = wasmModule;
	        this.encoder = encoder;
	        this.buffer = buffer;
	        this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
	        this.numberOfChannels = options.numberOfChannels || DEFAULT_CHANNELS;
	        this.bitrate = options.bitrate || DEFAULT_BITRATE;
	        this.enableDtx = options.enableDtx || DEFAULT_ENABLE_DTX;
	        this.frameSize = buffer.size();
	    }
	    /**
	     * 20ms 分の音声データをエンコードする
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
	        if (audioData.length !== this.frameSize) {
	            throw new Error(`expected an audio data with ${this.frameSize} samples, but got one with ${audioData.length} samples`);
	        }
	        this.wasmModule.copyInt16ArrayToAudioData(this.buffer, audioData);
	        const result = this.encoder.encode(this.buffer);
	        if (result === undefined) {
	            throw new Error("failed to encode");
	        }
	        else {
	            try {
	                const encodedAudioData = new Uint8Array(result.size());
	                for (let i = 0; i < encodedAudioData.length; i++) {
	                    encodedAudioData[i] = result.get(i);
	                }
	                if (encodedAudioData.length === 0) {
	                    // DTX が有効、かつ、 audioData が無音ないしノイズだけを含んでいる場合にはここに来る
	                    return undefined;
	                }
	                return encodedAudioData;
	            }
	            finally {
	                result.delete();
	            }
	        }
	    }
	    /**
	     * エンコードビットレートを変更する
	     *
	     * @params bitrate 変更後のビットレート
	     */
	    setBitrate(bitrate) {
	        checkBitrate(bitrate);
	        if (!this.encoder.setBitrate(bitrate)) {
	            throw new Error(`failed to update bitrate from ${this.bitrate} to ${bitrate}`);
	        }
	    }
	    /**
	     * エンコーダ用に確保したリソースを解放する
	     */
	    destroy() {
	        this.encoder.delete();
	        this.buffer.delete();
	    }
	}
	/**
	 * Lyra のデコーダ
	 */
	class LyraDecoder {
	    wasmModule;
	    decoder;
	    buffer;
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
	    constructor(wasmModule, decoder, buffer, options) {
	        this.wasmModule = wasmModule;
	        this.decoder = decoder;
	        this.buffer = buffer;
	        this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
	        this.numberOfChannels = options.numberOfChannels || DEFAULT_CHANNELS;
	        this.frameSize = (this.sampleRate * FRAME_DURATION_MS) / 1000;
	    }
	    /**
	     * {@link LyraEncoder.encode} メソッドによってエンコードされた音声データをデコードする
	     *
	     * @params encodedAudioData デコード対象のバイナリ列ないし undefined
	     * @returns デコードされた 20ms 分の音声データ。undefined が渡された場合には代わりにコンフォートノイズが生成される。
	     */
	    decode(encodedAudioData) {
	        if (encodedAudioData !== undefined) {
	            this.buffer.resize(0, 0); // clear() を使うと「関数が存在しない」というエラーが出るので resize() で代用
	            for (const v of encodedAudioData) {
	                this.buffer.push_back(v);
	            }
	            if (!this.decoder.setEncodedPacket(this.buffer)) {
	                throw new Error("failed to set encoded packet");
	            }
	        }
	        const result = this.decoder.decodeSamples(this.frameSize);
	        if (result === undefined) {
	            throw Error("failed to decode samples");
	        }
	        try {
	            const audioData = new Int16Array(this.frameSize);
	            this.wasmModule.copyAudioDataToInt16Array(audioData, result);
	            return audioData;
	        }
	        finally {
	            result.delete();
	        }
	    }
	    /**
	     * デコーダ用に確保したリソースを解放する
	     */
	    destroy() {
	        this.decoder.delete();
	        this.buffer.delete();
	    }
	}
	function trimLastSlash(s) {
	    if (s.slice(-1) === "/") {
	        return s.slice(0, -1);
	    }
	    return s;
	}
	function checkSampleRate(n) {
	    switch (n) {
	        case undefined:
	        case 8000:
	        case 16000:
	        case 32000:
	        case 48000:
	            return;
	    }
	    throw new Error(`unsupported sample rate: expected one of 8000, 16000, 32000 or 48000, but got ${n}`);
	}
	function checkNumberOfChannels(n) {
	    switch (n) {
	        case undefined:
	        case 1:
	            return;
	    }
	    throw new Error(`unsupported number of channels: expected 1, but got ${n}`);
	}
	function checkBitrate(n) {
	    switch (n) {
	        case undefined:
	        case 3200:
	        case 6000:
	        case 9200:
	            return;
	    }
	    throw new Error(`unsupported bitrate: expected one of 3200, 6000 or 9200, but got ${n}`);
	}

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
	    if (!("createEncodedStreams" in RTCRtpSender.prototype)) {
	        console.warn("This browser doesn't support WebRTC Encoded Transform feature that Lyra requires.");
	        return false;
	    }
	    if (typeof SharedArrayBuffer === "undefined") {
	        console.warn("Lyra requires cross-origin isolation to use SharedArrayBuffer.");
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
	        throw new Error("Lyra has not been initialized. Please call `Sora.initLyra()` beforehand.");
	    }
	    if (LYRA_MODULE === undefined) {
	        LYRA_MODULE = await LyraModule.load(LYRA_CONFIG.wasmPath, LYRA_CONFIG.modelPath);
	    }
	    return LYRA_MODULE;
	}
	/**
	 * PCM（L16）の音声データを Lyra でエンコードする
	 *
	 * @param encoder Lyra エンコーダ
	 * @param encodedFrame PCM 音声データ
	 * @param controller 音声データの出力キュー
	 */
	function transformPcmToLyra(encoder, encodedFrame, controller) {
	    const view = new DataView(encodedFrame.data);
	    const rawData = new Int16Array(encodedFrame.data.byteLength / 2);
	    for (let i = 0; i < encodedFrame.data.byteLength; i += 2) {
	        rawData[i / 2] = view.getInt16(i, false);
	    }
	    const encoded = encoder.encode(rawData);
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
	function transformLyraToPcm(decoder, encodedFrame, controller) {
	    if (encodedFrame.data.byteLength === 0) {
	        // FIXME(sile): sora-cpp-sdk の実装だと DTX の場合にペイロードサイズが 0 のパケットが飛んでくる可能性がある
	        //              一応保険としてこのチェックを入れているけれど、もし不要だと分かったら削除してしまう
	        return;
	    }
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
	    const decoded = decoder.decode(new Uint8Array(encodedFrame.data));
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
	            throw new Error(`UnsupportedLlyra version: ${version} (supported version is ${LYRA_VERSION$1})`);
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
	        return new LyraParams(version[1], Number(bitrate[1]), usedtx[1] == "1");
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
	        if (!sdp.includes("109 lyra/")) {
	            // 対象外なので処理する必要はない
	            return sdp;
	        }
	        const oldMidToLyraParams = this.midToLyraParams;
	        this.midToLyraParams = new Map();
	        const splited = sdp.split(/^m=/m);
	        let replacedSdp = splited[0];
	        for (let media of splited.slice(1)) {
	            const midResult = /a=mid:(.*)/.exec(media);
	            if (midResult === null) {
	                continue;
	            }
	            const mid = midResult[1];
	            if (media.startsWith("audio") && media.includes("109 lyra/")) {
	                let params = oldMidToLyraParams.get(mid);
	                if (params === undefined) {
	                    params = LyraParams.parseMediaDescription(media);
	                }
	                if (media.includes("a=recvonly")) {
	                    this.encoderOptions.bitrate = params.bitrate;
	                    this.encoderOptions.enableDtx = params.enableDtx;
	                }
	                this.midToLyraParams.set(mid, params);
	                // SDP を置換する:
	                // - libwebrtc は lyra を認識しないので L16 に置き換える
	                // - ただし SDP に L16 しか含まれていないと音声なし扱いになってしまうので、それを防ぐために 110 で opus を追加する
	                media = media
	                    .replace(/SAVPF([0-9 ]*) 109/, "SAVPF$1 109 110")
	                    .replace(/109 lyra[/]16000[/]1/, "110 opus/48000/2")
	                    .replace(/a=fmtp:109 .*/, "a=rtpmap:109 L16/16000\r\na=ptime:20");
	            }
	            replacedSdp += "m=" + media;
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
	        if (!sdp.includes("a=rtpmap:110 ")) {
	            // Lyra は使われていないので書き換えは不要
	            return sdp;
	        }
	        const splited = sdp.split(/^m=/m);
	        let replacedSdp = splited[0];
	        for (let media of splited.slice(1)) {
	            if (media.startsWith("audio") && media.includes("a=rtpmap:110 ")) {
	                // opus(110) ではなく L16(109) を使うように SDP を書き換える
	                //
	                // なお libwebrtc 的にはこの置換を行わなくても内部的には L16 が採用されるが、
	                // SDP と実際の動作を一致させるためにここで SDP を置換しておく
	                media = media
	                    .replace(/SAVPF([0-9 ]*) 110/, "SAVPF$1 109")
	                    .replace(/a=rtpmap:110 opus[/]48000[/]2/, "a=rtpmap:109 L16/16000")
	                    .replace(/a=fmtp:110 .*/, "a=ptime:20");
	            }
	            replacedSdp += "m=" + media;
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
	        if (!sdp.includes("a=rtpmap:109 L16/16000")) {
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
	            if (mid && media.startsWith("audio") && media.includes("a=rtpmap:109 L16/16000")) {
	                // Sora 用に L16 を Lyra に置換する
	                const params = this.midToLyraParams.get(mid);
	                if (params === undefined) {
	                    throw new Error(`Unknown audio mid ${mid}`);
	                }
	                media = media
	                    .replace(/a=rtpmap:109 L16[/]16000/, "a=rtpmap:109 lyra/16000/1")
	                    .replace(/a=ptime:20/, params.toFmtpString());
	            }
	            replacedSdp += "m=" + media;
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
	const LYRA_VERSION = "1.3.0";
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
	        sora_client: "Sora JavaScript SDK 2022.3.1",
	        environment: window.navigator.userAgent,
	        role: role,
	        channel_id: channelId,
	        sdp: offerSDP,
	        audio: true,
	        video: true,
	    };
	    // role: sendrecv で multistream: false の場合は例外を発生させる
	    if (role === "sendrecv" && options.multistream !== true) {
	        throw new Error("Failed to parse options. Options multistream must be true when connecting using 'sendrecv'");
	    }
	    if (redirect === true) {
	        message.redirect = true;
	    }
	    if (typeof options.multistream === "boolean") {
	        message.multistream = options.multistream;
	    }
	    if (typeof options.simulcast === "boolean") {
	        message.simulcast = options.simulcast;
	    }
	    const simalcastRids = ["r0", "r1", "r2"];
	    if (options.simulcastRid !== undefined && 0 <= simalcastRids.indexOf(options.simulcastRid)) {
	        message.simulcast_rid = options.simulcastRid;
	    }
	    if (typeof options.spotlight === "boolean") {
	        message.spotlight = options.spotlight;
	    }
	    if ("spotlightNumber" in options) {
	        message.spotlight_number = options.spotlightNumber;
	    }
	    const spotlightFocusRids = ["none", "r0", "r1", "r2"];
	    if (options.spotlightFocusRid !== undefined && 0 <= spotlightFocusRids.indexOf(options.spotlightFocusRid)) {
	        message.spotlight_focus_rid = options.spotlightFocusRid;
	    }
	    if (options.spotlightUnfocusRid !== undefined && 0 <= spotlightFocusRids.indexOf(options.spotlightUnfocusRid)) {
	        message.spotlight_unfocus_rid = options.spotlightUnfocusRid;
	    }
	    if (metadata !== undefined) {
	        message.metadata = metadata;
	    }
	    if (options.signalingNotifyMetadata !== undefined) {
	        message.signaling_notify_metadata = options.signalingNotifyMetadata;
	    }
	    if (options.clientId !== undefined) {
	        message.client_id = options.clientId;
	    }
	    if (options.bundleId !== undefined) {
	        message.bundle_id = options.bundleId;
	    }
	    if (typeof options.dataChannelSignaling === "boolean") {
	        message.data_channel_signaling = options.dataChannelSignaling;
	    }
	    if (typeof options.ignoreDisconnectWebSocket === "boolean") {
	        message.ignore_disconnect_websocket = options.ignoreDisconnectWebSocket;
	    }
	    // parse options
	    const audioPropertyKeys = ["audioCodecType", "audioBitRate"];
	    const audioOpusParamsPropertyKeys = [
	        "audioOpusParamsChannels",
	        "audioOpusParamsMaxplaybackrate",
	        "audioOpusParamsStereo",
	        "audioOpusParamsSpropStereo",
	        "audioOpusParamsMinptime",
	        "audioOpusParamsPtime",
	        "audioOpusParamsUseinbandfec",
	        "audioOpusParamsUsedtx",
	    ];
	    const audioLyraParamsPropertyKeys = ["audioLyraParamsBitrate", "audioLyraParamsUsedtx"];
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
	    if (message.audio && options.audioCodecType == "LYRA") {
	        if (typeof message.audio != "object") {
	            message.audio = {};
	        }
	        message.audio.lyra_params = { version: LYRA_VERSION };
	        if ("audioLyraParamsBitrate" in copyOptions) {
	            message.audio.lyra_params.bitrate = copyOptions.audioLyraParamsBitrate;
	        }
	        if ("audioLyraParamsUsedtx" in copyOptions) {
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
	    if (typeof options.e2ee === "boolean") {
	        message.e2ee = options.e2ee;
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
	        this.connectedSignalingUrl = "";
	        this.contactSignalingUrl = "";
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
	        this.contactSignalingUrl = "";
	        this.connectedSignalingUrl = "";
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
	                        this.writeWebSocketSignalingLog("signaling-url-candidate", {
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
	                        this.writeWebSocketSignalingLog("signaling-url-candidate", {
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
	                        this.writeWebSocketSignalingLog("signaling-url-candidate", {
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
	                                this.writeWebSocketSignalingLog("signaling-url-candidate", {
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
	                                this.writeWebSocketSignalingLog("signaling-url-candidate", {
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
	            ws.onclose = (event) => {
	                const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                error.code = event.code;
	                error.reason = event.reason;
	                this.writeWebSocketTimelineLog("onclose", error);
	                this.signalingTerminate();
	                reject(error);
	            };
	            ws.onmessage = async (event) => {
	                // E2EE 時専用処理
	                if (event.data instanceof ArrayBuffer) {
	                    this.writeWebSocketSignalingLog("onmessage-e2ee", event.data);
	                    this.signalingOnMessageE2EE(event.data);
	                    return;
	                }
	                if (typeof event.data !== "string") {
	                    throw new Error("Received invalid signaling data");
	                }
	                const message = JSON.parse(event.data);
	                if (message.type == "offer") {
	                    this.writeWebSocketSignalingLog("onmessage-offer", message);
	                    this.signalingOnMessageTypeOffer(message);
	                    this.connectedSignalingUrl = ws.url;
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
	                    try {
	                        const redirectMessage = await this.signalingOnMessageTypeRedirect(message);
	                        resolve(redirectMessage);
	                    }
	                    catch (error) {
	                        reject(error);
	                    }
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
	                    // 初回に接続した URL を状態管理する
	                    if (!redirect) {
	                        this.contactSignalingUrl = ws.url;
	                        this.writeWebSocketSignalingLog("contact-signaling-url", this.contactSignalingUrl);
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
	        const sdp = this.processOfferSdp(message.sdp);
	        const sessionDescription = new RTCSessionDescription({ type: "offer", sdp });
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
	                // TODO(sile): 動作確認
	                if (sessionDescription.sdp !== undefined) {
	                    sessionDescription.sdp = this.processAnswerSdpForLocal(sessionDescription.sdp);
	                }
	                await this.pc.setLocalDescription(sessionDescription);
	                this.trace("TRANSCEIVER SENDER GET_PARAMETERS", transceiver.sender.getParameters());
	                return;
	            }
	        }
	        const sessionDescription = await this.pc.createAnswer();
	        if (sessionDescription.sdp !== undefined) {
	            sessionDescription.sdp = this.processAnswerSdpForLocal(sessionDescription.sdp);
	        }
	        this.writePeerConnectionTimelineLog("create-answer", sessionDescription);
	        await this.pc.setLocalDescription(sessionDescription);
	        this.writePeerConnectionTimelineLog("set-local-description", sessionDescription);
	        return;
	    }
	    /**
	     * カスタムコーデック対応用に offer SDP を処理するメソッド
	     *
	     * @param sdp offer SDP
	     * @returns 処理後の SDP
	     */
	    processOfferSdp(sdp) {
	        if (this.lyra === undefined || !sdp.includes("109 lyra/")) {
	            return sdp;
	        }
	        // mid と音声コーデックの対応を保存する
	        this.midToAudioCodecType.clear();
	        for (const media of sdp.split(/^m=/m).slice(1)) {
	            if (!media.startsWith("audio")) {
	                continue;
	            }
	            const mid = /a=mid:(.*)/.exec(media);
	            if (mid) {
	                const codecType = media.includes("109 lyra/") ? "LYRA" : "OPUS";
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
	        // TODO(sile): WebRTC Encoded Transform の型が提供されるようになったら ignore を外す
	        // @ts-ignore
	        // eslint-disable-next-line
	        const senderStreams = sender.createEncodedStreams();
	        const isLyraCodec = sender.track.kind === "audio" && this.options.audioCodecType === "LYRA";
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
	        // TODO(sile): WebRTC Encoded Transform の型が提供されるようになったら ignore を外す
	        // @ts-ignore
	        // eslint-disable-next-line
	        const receiverStreams = receiver.createEncodedStreams();
	        const codecType = this.midToAudioCodecType.get(mid || "");
	        let writable = receiverStreams.writable;
	        if (codecType == "LYRA" && this.lyra !== undefined) {
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
	    /**
	     * シグナリングサーバーに type answer を投げるメソッド
	     */
	    sendAnswer() {
	        if (this.pc && this.ws && this.pc.localDescription) {
	            this.trace("ANSWER SDP", this.pc.localDescription.sdp);
	            const sdp = this.processAnswerSdpForSora(this.pc.localDescription.sdp);
	            const message = { type: "answer", sdp };
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
	                this.ws.onclose = (event) => {
	                    const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                    error.code = event.code;
	                    error.reason = event.reason;
	                    this.writeWebSocketTimelineLog("onclose", error);
	                    this.signalingTerminate();
	                    reject(error);
	                };
	                this.ws.onerror = (_) => {
	                    const error = new ConnectError(`Signaling failed. WebSocket onerror was called`);
	                    this.writeWebSocketSignalingLog("onerror", error);
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
	        this.pc.oniceconnectionstatechange = (_) => {
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
	                    this.abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED");
	                }
	                // iceConnectionState "disconnected" になってから 10000ms の間変化がない場合切断する
	                else if (this.pc.iceConnectionState === "disconnected") {
	                    this.monitorIceConnectionStateChangeTimerId = setTimeout(() => {
	                        if (this.pc && this.pc.iceConnectionState === "disconnected") {
	                            this.abendPeerConnectionState("ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT");
	                        }
	                    }, 10000);
	                }
	            }
	        };
	        this.pc.onconnectionstatechange = (_) => {
	            if (this.pc) {
	                this.writePeerConnectionTimelineLog("onconnectionstatechange", {
	                    connectionState: this.pc.connectionState,
	                    iceConnectionState: this.pc.iceConnectionState,
	                    iceGatheringState: this.pc.iceGatheringState,
	                });
	                if (this.pc.connectionState === "failed") {
	                    this.abendPeerConnectionState("CONNECTION-STATE-FAILED");
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
	                        (this.pc && this.pc.connectionState !== undefined && this.pc.connectionState !== "connected")) {
	                        const error = new Error();
	                        error.message = "Signaling connection timeout";
	                        this.callbacks.timeout();
	                        this.trace("DISCONNECT", "Signaling connection timeout");
	                        this.writePeerConnectionTimelineLog("signaling-connection-timeout", {
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
	        dataChannel.bufferedAmountLowThreshold = 65536;
	        dataChannel.binaryType = "arraybuffer";
	        this.soraDataChannels[dataChannel.label] = dataChannel;
	        this.writeDataChannelTimelineLog("ondatachannel", dataChannel, createDataChannelData(dataChannel));
	        // onbufferedamountlow
	        dataChannelEvent.channel.onbufferedamountlow = (event) => {
	            const channel = event.currentTarget;
	            this.writeDataChannelTimelineLog("onbufferedamountlow", channel);
	        };
	        // onopen
	        dataChannelEvent.channel.onopen = (event) => {
	            const channel = event.currentTarget;
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
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
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
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
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
	                const channel = event.currentTarget;
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
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
	                const channel = event.currentTarget;
	                const label = channel.label;
	                const dataChannelSettings = this.signalingOfferMessageDataChannels[label];
	                if (!dataChannelSettings) {
	                    console.warn(`Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`);
	                    return;
	                }
	                const data = parseDataChannelEventData(event.data, dataChannelSettings.compress);
	                const message = JSON.parse(data);
	                if (message.type === "req-stats") {
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
	                if (typeof event.data === "string") {
	                    data = new TextEncoder().encode(event.data);
	                }
	                else if (event.data instanceof ArrayBuffer) {
	                    data = event.data;
	                }
	                else {
	                    console.warn("Received onmessage event data is not of type String or ArrayBuffer.");
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
	        if (dataChannel.readyState !== "open") {
	            throw new Error("Messaging DataChannel is not open");
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
	                if (streamId === "default") {
	                    return;
	                }
	                const data = {
	                    // eslint-disable-next-line @typescript-eslint/naming-convention
	                    "stream.id": streamId,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog("ontrack", data);
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
	                if (stream.id === "default") {
	                    return;
	                }
	                if (stream.id === this.connectionId) {
	                    return;
	                }
	                const data = {
	                    // eslint-disable-next-line @typescript-eslint/naming-convention
	                    "stream.id": stream.id,
	                    id: event.track.id,
	                    label: event.track.label,
	                    enabled: event.track.enabled,
	                    kind: event.track.kind,
	                    muted: event.track.muted,
	                    readyState: event.track.readyState,
	                };
	                this.writePeerConnectionTimelineLog("ontrack", data);
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
	        // sendrecv の場合、multistream に初期値を指定する
	        const sendrecvOptions = Object.assign({ multistream: true }, options);
	        return new ConnectionPublisher(this.signalingUrlCandidates, "sendrecv", channelId, metadata, sendrecvOptions, this.debug);
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
	        return "2022.3.1";
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
