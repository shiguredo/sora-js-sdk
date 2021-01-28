/**
 * @sora/sdk
 * undefined
 * @version: 2020.6.2
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Sora = factory());
}(this, (function () { 'use strict';

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
	 * @version: 2020.6.0
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
	        if (!sender.track)
	            return;
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
	        return "2020.6.0";
	    }
	    static wasmVersion() {
	        return window.e2ee.version();
	    }
	}

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
	function isEdge() {
	    return browser() === "edge";
	}
	function isSafari() {
	    return browser() === "safari";
	}
	function createSignalingMessage(offerSDP, role, channelId, metadata, options) {
	    if (role !== "upstream" &&
	        role !== "downstream" &&
	        role !== "sendrecv" &&
	        role !== "sendonly" &&
	        role !== "recvonly") {
	        throw new Error("Unknown role type");
	    }
	    if (channelId === null || channelId === undefined) {
	        throw new Error("channelId can not be null or undefined");
	    }
	    const message = {
	        type: "connect",
	        // @ts-ignore
	        // eslint-disable-next-line @typescript-eslint/camelcase
	        sora_client: `Sora JavaScript SDK ${'2020.6.2'}`,
	        environment: window.navigator.userAgent,
	        role: role,
	        // eslint-disable-next-line @typescript-eslint/camelcase
	        channel_id: channelId,
	        sdp: offerSDP,
	        audio: true,
	        video: true,
	    };
	    if (metadata !== undefined) {
	        message.metadata = metadata;
	    }
	    if ("signalingNotifyMetadata" in options) {
	        // eslint-disable-next-line @typescript-eslint/camelcase
	        message.signaling_notify_metadata = options.signalingNotifyMetadata;
	    }
	    if ("multistream" in options && options.multistream === true) {
	        // multistream
	        message.multistream = true;
	        // spotlight
	        if ("spotlight" in options) {
	            message.spotlight = options.spotlight;
	            if ("spotlightNumber" in options) {
	                // eslint-disable-next-line @typescript-eslint/camelcase
	                message.spotlight_number = options.spotlightNumber;
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
	            // eslint-disable-next-line @typescript-eslint/camelcase
	            message.simulcast_rid = options.simulcastRid;
	        }
	    }
	    // client_id
	    if ("clientId" in options && options.clientId !== undefined) {
	        // eslint-disable-next-line @typescript-eslint/camelcase
	        message.client_id = options.clientId;
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
	        if (key === "audio" && typeof copyOptions[key] === "boolean")
	            return;
	        if (key === "video" && typeof copyOptions[key] === "boolean")
	            return;
	        if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null)
	            return;
	        if (0 <= audioOpusParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null)
	            return;
	        if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null)
	            return;
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
	        // eslint-disable-next-line @typescript-eslint/camelcase
	        message.audio.opus_params = {};
	        if ("audioOpusParamsChannels" in copyOptions) {
	            message.audio.opus_params.channels = copyOptions.audioOpusParamsChannels;
	        }
	        if ("audioOpusParamsClockRate" in copyOptions) {
	            // eslint-disable-next-line @typescript-eslint/camelcase
	            message.audio.opus_params.clock_rate = copyOptions.audioOpusParamsClockRate;
	        }
	        if ("audioOpusParamsMaxplaybackrate" in copyOptions) {
	            message.audio.opus_params.maxplaybackrate = copyOptions.audioOpusParamsMaxplaybackrate;
	        }
	        if ("audioOpusParamsStereo" in copyOptions) {
	            message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo;
	        }
	        if ("audioOpusParamsSpropStereo" in copyOptions) {
	            // eslint-disable-next-line @typescript-eslint/camelcase
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
	    if (message.simulcast && !enabledSimulcast()) {
	        throw new Error("Simulcast can not be used with this browser");
	    }
	    if (options.e2ee === true) {
	        // eslint-disable-next-line @typescript-eslint/camelcase
	        if (message.signaling_notify_metadata === undefined) {
	            // eslint-disable-next-line @typescript-eslint/camelcase
	            message.signaling_notify_metadata = {};
	        }
	        // eslint-disable-next-line @typescript-eslint/camelcase
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
	    if (message.data !== undefined && Array.isArray(message.data)) {
	        return message.data;
	    }
	    else if (message.metadata_list !== undefined && Array.isArray(message.metadata_list)) {
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function trace(clientId, title, value) {
	    let prefix = "";
	    if (window.performance) {
	        prefix = "[" + (window.performance.now() / 1000).toFixed(3) + "]";
	    }
	    if (clientId) {
	        prefix = prefix + "[" + clientId + "]";
	    }
	    if (isEdge()) {
	        console.log(prefix + " " + title + "\n", value); // eslint-disable-line
	    }
	    else {
	        console.info(prefix + " " + title + "\n", value); // eslint-disable-line
	    }
	}
	class ConnectError extends Error {
	}

	class ConnectionBase {
	    constructor(signalingUrl, role, channelId, metadata, options, debug) {
	        this.role = role;
	        this.channelId = channelId;
	        this.metadata = metadata;
	        this.signalingUrl = signalingUrl;
	        this.options = options;
	        // client timeout の初期値をセットする
	        if (this.options.timeout === undefined) {
	            this.options.timeout = 60000;
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
	        };
	        this.authMetadata = null;
	        this.e2ee = null;
	    }
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
	    disconnect() {
	        this.clientId = null;
	        this.connectionId = null;
	        this.authMetadata = null;
	        this.remoteConnectionIds = [];
	        const closeStream = new Promise((resolve, _) => {
	            if (this.debug) {
	                console.warn("@deprecated closing MediaStream in disconnect will be removed in a future version. Close every track in the MediaStream by yourself.");
	            }
	            if (!this.stream)
	                return resolve();
	            this.stream.getTracks().forEach((t) => {
	                t.stop();
	            });
	            this.stream = null;
	            return resolve();
	        });
	        const closeWebSocket = new Promise((resolve, _reject) => {
	            if (!this.ws)
	                return resolve();
	            if (this.ws.readyState === 1) {
	                this.ws.send(JSON.stringify({ type: "disconnect" }));
	            }
	            this.ws.close();
	            this.ws = null;
	            return resolve();
	        });
	        const closePeerConnection = new Promise((resolve, _reject) => {
	            if (!this.pc || this.pc.connectionState === "closed" || this.pc.connectionState === undefined)
	                return resolve();
	            let counter = 50;
	            const timerId = setInterval(() => {
	                if (!this.pc) {
	                    clearInterval(timerId);
	                    return resolve();
	                }
	                if (this.pc.connectionState === "closed") {
	                    clearInterval(timerId);
	                    this.pc = null;
	                    return resolve();
	                }
	                --counter;
	                if (counter < 0) {
	                    clearInterval(timerId);
	                    return resolve();
	                }
	            }, 100);
	            this.pc.close();
	        });
	        if (this.e2ee) {
	            this.e2ee.terminateWorker();
	            this.e2ee = null;
	        }
	        return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
	    }
	    setupE2EE() {
	        if (this.options.e2ee === true) {
	            this.e2ee = new SoraE2EE();
	            this.e2ee.onWorkerDisconnect = () => {
	                this.disconnect();
	            };
	            this.e2ee.startWorker();
	        }
	    }
	    startE2EE() {
	        if (this.options.e2ee === true && this.e2ee) {
	            if (!this.connectionId) {
	                const error = new Error();
	                error.message = `E2EE failed. Self connectionId is ${this.connectionId}`;
	                throw error;
	            }
	            this.e2ee.clearWorker();
	            const result = this.e2ee.start(this.connectionId);
	            this.e2ee.postSelfSecretKeyMaterial(this.connectionId, result.selfKeyId, result.selfSecretKeyMaterial);
	        }
	    }
	    signaling(offer) {
	        this.trace("CREATE OFFER SDP", offer);
	        // TODO(yuito): 一旦 disable にする
	        // eslint-disable-next-line  no-async-promise-executor
	        return new Promise(async (resolve, reject) => {
	            const signalingMessage = createSignalingMessage(offer.sdp || "", this.role, this.channelId, this.metadata, this.options);
	            if (signalingMessage.e2ee && this.e2ee) {
	                const initResult = await this.e2ee.init();
	                // @ts-ignore signalingMessage の e2ee が true の場合は signalingNotifyMetadata が必ず object になる
	                signalingMessage["signaling_notify_metadata"]["pre_key_bundle"] = initResult;
	            }
	            if (this.ws === null) {
	                this.ws = new WebSocket(this.signalingUrl);
	            }
	            this.ws.binaryType = "arraybuffer";
	            this.ws.onclose = (event) => {
	                const error = new ConnectError(`Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`);
	                error.code = event.code;
	                error.reason = event.reason;
	                reject(error);
	            };
	            this.ws.onopen = () => {
	                this.trace("SIGNALING CONNECT MESSAGE", signalingMessage);
	                if (this.ws) {
	                    this.ws.send(JSON.stringify(signalingMessage));
	                }
	            };
	            this.ws.onmessage = (event) => {
	                // E2EE 時専用処理
	                if (event.data instanceof ArrayBuffer && this.e2ee) {
	                    const message = new Uint8Array(event.data);
	                    const result = this.e2ee.receiveMessage(message);
	                    this.e2ee.postRemoteSecretKeyMaterials(result);
	                    result.messages.forEach((message) => {
	                        if (this.ws) {
	                            this.ws.send(message.buffer);
	                        }
	                    });
	                    return;
	                }
	                const message = JSON.parse(event.data);
	                if (message.type == "offer") {
	                    this.clientId = message.client_id;
	                    this.connectionId = message.connection_id;
	                    if (this.ws) {
	                        this.ws.onclose = (e) => {
	                            this.callbacks.disconnect(e);
	                            this.disconnect();
	                        };
	                        this.ws.onerror = null;
	                    }
	                    if ("metadata" in message) {
	                        this.authMetadata = message.metadata;
	                    }
	                    if ("encodings" in message && Array.isArray(message.encodings)) {
	                        this.encodings = message.encodings;
	                    }
	                    this.trace("SIGNALING OFFER MESSAGE", message);
	                    this.trace("OFFER SDP", message.sdp);
	                    resolve(message);
	                }
	                else if (message.type == "update") {
	                    this.trace("UPDATE SDP", message.sdp);
	                    this.update(message);
	                }
	                else if (message.type == "ping") {
	                    if (message.stats) {
	                        this.getStats().then((stats) => {
	                            if (this.ws) {
	                                this.ws.send(JSON.stringify({ type: "pong", stats: stats }));
	                            }
	                        });
	                    }
	                    else {
	                        if (this.ws) {
	                            this.ws.send(JSON.stringify({ type: "pong" }));
	                        }
	                    }
	                }
	                else if (message.type == "push") {
	                    this.callbacks.push(message);
	                }
	                else if (message.type == "notify") {
	                    if (message.event_type === "connection.created") {
	                        const connectionId = message.connection_id;
	                        if (this.connectionId !== connectionId) {
	                            const authnMetadata = getSignalingNotifyAuthnMetadata(message);
	                            const preKeyBundle = getPreKeyBundle(authnMetadata);
	                            if (preKeyBundle && this.e2ee) {
	                                const result = this.e2ee.startSession(connectionId, preKeyBundle);
	                                this.e2ee.postRemoteSecretKeyMaterials(result);
	                                result.messages.forEach((message) => {
	                                    if (this.ws) {
	                                        this.ws.send(message.buffer);
	                                    }
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
	                        if (preKeyBundle && this.e2ee) {
	                            const connectionId = message.connection_id;
	                            const result = this.e2ee.stopSession(connectionId);
	                            this.e2ee.postSelfSecretKeyMaterial(result.selfConnectionId, result.selfKeyId, result.selfSecretKeyMaterial, 5000);
	                            result.messages.forEach((message) => {
	                                if (this.ws) {
	                                    this.ws.send(message.buffer);
	                                }
	                            });
	                            this.e2ee.postRemoveRemoteDeriveKey(connectionId);
	                        }
	                    }
	                    this.callbacks.notify(message);
	                }
	            };
	        });
	    }
	    async createOffer() {
	        const config = { iceServers: [] };
	        const pc = new window.RTCPeerConnection(config);
	        if (isSafari()) {
	            pc.addTransceiver("video", { direction: "recvonly" });
	            pc.addTransceiver("audio", { direction: "recvonly" });
	            const offer = await pc.createOffer();
	            pc.close();
	            return offer;
	        }
	        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
	        pc.close();
	        return offer;
	    }
	    async connectPeerConnection(message) {
	        const messageConfig = message.config || {};
	        let config = messageConfig;
	        if (this.e2ee) {
	            // @ts-ignore
	            config["encodedInsertableStreams"] = true;
	        }
	        if (window.RTCPeerConnection.generateCertificate !== undefined) {
	            const certificate = await window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
	            config = Object.assign({ certificates: [certificate] }, messageConfig);
	        }
	        this.trace("PEER CONNECTION CONFIG", config);
	        this.pc = new window.RTCPeerConnection(config, this.constraints);
	        this.pc.oniceconnectionstatechange = (_) => {
	            if (this.pc) {
	                this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
	            }
	        };
	        return;
	    }
	    async setRemoteDescription(message) {
	        if (!this.pc) {
	            return;
	        }
	        await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: message.sdp }));
	        return;
	    }
	    async createAnswer(message) {
	        if (!this.pc) {
	            return;
	        }
	        // simulcast の場合
	        if (this.options.simulcast && (this.role === "upstream" || this.role === "sendrecv" || this.role === "sendonly")) {
	            const transceiver = this.pc.getTransceivers().find((t) => {
	                if (t.mid &&
	                    0 <= t.mid.indexOf("video") &&
	                    t.sender.track !== null &&
	                    (t.currentDirection === null || t.currentDirection === "sendonly")) {
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
	        await this.pc.setLocalDescription(sessionDescription);
	        return;
	    }
	    sendAnswer() {
	        if (this.pc && this.ws && this.pc.localDescription) {
	            this.trace("ANSWER SDP", this.pc.localDescription.sdp);
	            this.ws.send(JSON.stringify({ type: "answer", sdp: this.pc.localDescription.sdp }));
	        }
	        return;
	    }
	    sendUpdateAnswer() {
	        if (this.pc && this.ws && this.pc.localDescription) {
	            this.trace("ANSWER SDP", this.pc.localDescription.sdp);
	            this.ws.send(JSON.stringify({ type: "update", sdp: this.pc.localDescription.sdp }));
	        }
	        return;
	    }
	    onIceCandidate() {
	        return new Promise((resolve, reject) => {
	            const timerId = setInterval(() => {
	                if (this.pc === null) {
	                    clearInterval(timerId);
	                    const error = new Error();
	                    error.message = "ICECANDIDATE TIMEOUT";
	                    reject(error);
	                }
	                else if (this.pc && this.pc.iceConnectionState === "connected") {
	                    clearInterval(timerId);
	                    resolve();
	                }
	            }, 100);
	            if (this.pc) {
	                this.pc.onicecandidate = (event) => {
	                    if (this.pc) {
	                        this.trace("ONICECANDIDATE ICEGATHERINGSTATE", this.pc.iceGatheringState);
	                    }
	                    if (event.candidate === null) {
	                        clearInterval(timerId);
	                        resolve();
	                    }
	                    else {
	                        const candidate = event.candidate.toJSON();
	                        const message = Object.assign(candidate, { type: "candidate" });
	                        this.trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
	                        if (this.ws) {
	                            this.ws.send(JSON.stringify(message));
	                        }
	                    }
	                };
	            }
	        });
	    }
	    waitChangeConnectionStateConnected() {
	        return new Promise((resolve, reject) => {
	            // connectionState が存在しない場合はそのまま抜ける
	            if (this.pc && this.pc.connectionState === undefined) {
	                resolve();
	            }
	            const timerId = setInterval(() => {
	                if (!this.pc) {
	                    const error = new Error();
	                    error.message = "PeerConnection connectionState did not change to 'connected'";
	                    clearInterval(timerId);
	                    reject(error);
	                }
	                else if (!this.ws || this.ws.readyState !== 1) {
	                    const error = new Error();
	                    error.message = "PeerConnection connectionState did not change to 'connected'";
	                    clearInterval(timerId);
	                    reject(error);
	                }
	                else if (this.pc && this.pc.connectionState === "connected") {
	                    clearInterval(timerId);
	                    resolve();
	                }
	            }, 100);
	        });
	    }
	    setConnectionTimeout() {
	        return new Promise((_, reject) => {
	            if (this.options.timeout && 0 < this.options.timeout) {
	                setTimeout(() => {
	                    if (!this.pc ||
	                        (this.pc && this.pc.connectionState !== undefined && this.pc.connectionState !== "connected")) {
	                        const error = new Error();
	                        error.message = "CONNECTION TIMEOUT";
	                        this.callbacks.timeout();
	                        this.disconnect();
	                        reject(error);
	                    }
	                }, this.options.timeout);
	            }
	        });
	    }
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    trace(title, message) {
	        this.callbacks.log(title, message);
	        if (!this.debug) {
	            return;
	        }
	        trace(this.clientId, title, message);
	    }
	    async update(message) {
	        await this.setRemoteDescription(message);
	        await this.createAnswer(message);
	        this.sendUpdateAnswer();
	    }
	    async setSenderParameters(transceiver, encodings) {
	        const originalParameters = transceiver.sender.getParameters();
	        // @ts-ignore
	        originalParameters.encodings = encodings;
	        await transceiver.sender.setParameters(originalParameters);
	        this.trace("TRANSCEIVER SENDER SET_PARAMETERS", originalParameters);
	        return;
	    }
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
	    get e2eeSelfFingerprint() {
	        if (this.options.e2ee && this.e2ee) {
	            return this.e2ee.selfFingerprint();
	        }
	        return;
	    }
	    get e2eeRemoteFingerprints() {
	        if (this.options.e2ee && this.e2ee) {
	            return this.e2ee.remoteFingerprints();
	        }
	        return;
	    }
	}

	class ConnectionPublisher extends ConnectionBase {
	    async connect(stream) {
	        if (this.options.multistream) {
	            return await Promise.race([this.multiStream(stream), this.setConnectionTimeout()]);
	        }
	        else {
	            return await Promise.race([this.singleStream(stream), this.setConnectionTimeout()]);
	        }
	    }
	    async singleStream(stream) {
	        await this.disconnect();
	        this.setupE2EE();
	        const offer = await this.createOffer();
	        const signalingMessage = await this.signaling(offer);
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
	    async multiStream(stream) {
	        await this.disconnect();
	        this.setupE2EE();
	        const offer = await this.createOffer();
	        const signalingMessage = await this.signaling(offer);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = (event) => {
	                const stream = event.streams[0];
	                if (!stream)
	                    return;
	                if (stream.id === "default")
	                    return;
	                if (stream.id === this.connectionId)
	                    return;
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
	                if (-1 < this.remoteConnectionIds.indexOf(stream.id))
	                    return;
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

	class ConnectionSubscriber extends ConnectionBase {
	    async connect() {
	        if (this.options.multistream) {
	            return await Promise.race([this.multiStream(), this.setConnectionTimeout()]);
	        }
	        else {
	            return await Promise.race([this.singleStream(), this.setConnectionTimeout()]);
	        }
	    }
	    async singleStream() {
	        await this.disconnect();
	        this.setupE2EE();
	        const offer = await this.createOffer();
	        const signalingMessage = await this.signaling(offer);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = (event) => {
	                this.stream = event.streams[0];
	                const streamId = this.stream.id;
	                if (streamId === "default")
	                    return;
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
	                if (-1 < this.remoteConnectionIds.indexOf(streamId))
	                    return;
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
	    async multiStream() {
	        await this.disconnect();
	        this.setupE2EE();
	        const offer = await this.createOffer();
	        const signalingMessage = await this.signaling(offer);
	        this.startE2EE();
	        await this.connectPeerConnection(signalingMessage);
	        if (this.pc) {
	            this.pc.ontrack = (event) => {
	                const stream = event.streams[0];
	                if (stream.id === "default")
	                    return;
	                if (stream.id === this.connectionId)
	                    return;
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
	                if (-1 < this.remoteConnectionIds.indexOf(stream.id))
	                    return;
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

	class SoraConnection {
	    constructor(signalingUrl, debug = false) {
	        this.signalingUrl = signalingUrl;
	        this.debug = debug;
	    }
	    // 古い role
	    // @deprecated 1 年は残します
	    publisher(channelId, metadata = null, options = { audio: true, video: true }) {
	        console.warn("@deprecated publisher will be removed in a future version. Use sendrecv or sendonly.");
	        return new ConnectionPublisher(this.signalingUrl, "upstream", channelId, metadata, options, this.debug);
	    }
	    // @deprecated 1 年は残します
	    subscriber(channelId, metadata = null, options = { audio: true, video: true }) {
	        console.warn("@deprecated subscriber will be removed in a future version. Use recvonly.");
	        return new ConnectionSubscriber(this.signalingUrl, "downstream", channelId, metadata, options, this.debug);
	    }
	    // 新しい role
	    sendrecv(channelId, metadata = null, options = { audio: true, video: true }) {
	        return new ConnectionPublisher(this.signalingUrl, "sendrecv", channelId, metadata, options, this.debug);
	    }
	    sendonly(channelId, metadata = null, options = { audio: true, video: true }) {
	        return new ConnectionPublisher(this.signalingUrl, "sendonly", channelId, metadata, options, this.debug);
	    }
	    recvonly(channelId, metadata = null, options = { audio: true, video: true }) {
	        return new ConnectionSubscriber(this.signalingUrl, "recvonly", channelId, metadata, options, this.debug);
	    }
	}
	var sora = {
	    initE2EE: async function (wasmUrl) {
	        await SoraE2EE.loadWasm(wasmUrl);
	    },
	    connection: function (signalingUrl, debug = false) {
	        return new SoraConnection(signalingUrl, debug);
	    },
	    version: function () {
	        // @ts-ignore
	        return '2020.6.2';
	    },
	};

	return sora;

})));
