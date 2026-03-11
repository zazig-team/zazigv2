import { createRequire } from "module"; const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../node_modules/tslib/tslib.es6.mjs
var tslib_es6_exports = {};
__export(tslib_es6_exports, {
  __addDisposableResource: () => __addDisposableResource,
  __assign: () => __assign,
  __asyncDelegator: () => __asyncDelegator,
  __asyncGenerator: () => __asyncGenerator,
  __asyncValues: () => __asyncValues,
  __await: () => __await,
  __awaiter: () => __awaiter,
  __classPrivateFieldGet: () => __classPrivateFieldGet,
  __classPrivateFieldIn: () => __classPrivateFieldIn,
  __classPrivateFieldSet: () => __classPrivateFieldSet,
  __createBinding: () => __createBinding,
  __decorate: () => __decorate,
  __disposeResources: () => __disposeResources,
  __esDecorate: () => __esDecorate,
  __exportStar: () => __exportStar,
  __extends: () => __extends,
  __generator: () => __generator,
  __importDefault: () => __importDefault,
  __importStar: () => __importStar,
  __makeTemplateObject: () => __makeTemplateObject,
  __metadata: () => __metadata,
  __param: () => __param,
  __propKey: () => __propKey,
  __read: () => __read,
  __rest: () => __rest,
  __rewriteRelativeImportExtension: () => __rewriteRelativeImportExtension,
  __runInitializers: () => __runInitializers,
  __setFunctionName: () => __setFunctionName,
  __spread: () => __spread,
  __spreadArray: () => __spreadArray,
  __spreadArrays: () => __spreadArrays,
  __values: () => __values,
  default: () => tslib_es6_default
});
function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
    throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
    t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
        t[p[i]] = s[p[i]];
    }
  return t;
}
function __decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function __param(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
    if (kind === "accessor") {
      if (result === void 0) continue;
      if (result === null || typeof result !== "object") throw new TypeError("Object expected");
      if (_ = accept(result.get)) descriptor.get = _;
      if (_ = accept(result.set)) descriptor.set = _;
      if (_ = accept(result.init)) initializers.unshift(_);
    } else if (_ = accept(result)) {
      if (kind === "field") initializers.unshift(_);
      else descriptor[key] = _;
    }
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
}
function __runInitializers(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
    value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
}
function __propKey(x) {
  return typeof x === "symbol" ? x : "".concat(x);
}
function __setFunctionName(f, name, prefix) {
  if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
  return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
}
function __metadata(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve4) {
      resolve4(value);
    });
  }
  return new (P || (P = Promise))(function(resolve4, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve4(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __exportStar(m, o) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
}
function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
}
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
    ar = ar.concat(__read(arguments[i]));
  return ar;
}
function __spreadArrays() {
  for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
  for (var r = Array(s), k = 0, i = 0; i < il; i++)
    for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
      r[k] = a[j];
  return r;
}
function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function awaitReturn(f) {
    return function(v) {
      return Promise.resolve(v).then(f, reject);
    };
  }
  function verb(n, f) {
    if (g[n]) {
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
      if (f) i[n] = f(i[n]);
    }
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
  }
}
function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function(e) {
    throw e;
  }), verb("return"), i[Symbol.iterator] = function() {
    return this;
  }, i;
  function verb(n, f) {
    i[n] = o[n] ? function(v) {
      return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v;
    } : f;
  }
}
function __asyncValues(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve4, reject) {
        v = o[n](v), settle(resolve4, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve4, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve4({ value: v2, done: d });
    }, reject);
  }
}
function __makeTemplateObject(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
  }
  __setModuleDefault(result, mod);
  return result;
}
function __importDefault(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldIn(state, receiver) {
  if (receiver === null || typeof receiver !== "object" && typeof receiver !== "function") throw new TypeError("Cannot use 'in' operator on non-object");
  return typeof state === "function" ? receiver === state : state.has(receiver);
}
function __addDisposableResource(env, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    if (async) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    env.stack.push({ value, dispose, async });
  } else if (async) {
    env.stack.push({ async: true });
  }
  return value;
}
function __disposeResources(env) {
  function fail(e) {
    env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
    env.hasError = true;
  }
  var r, s = 0;
  function next() {
    while (r = env.stack.pop()) {
      try {
        if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
        if (r.dispose) {
          var result = r.dispose.call(r.value);
          if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
            fail(e);
            return next();
          });
        } else s |= 1;
      } catch (e) {
        fail(e);
      }
    }
    if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
    if (env.hasError) throw env.error;
  }
  return next();
}
function __rewriteRelativeImportExtension(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
    return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path;
}
var extendStatics, __assign, __createBinding, __setModuleDefault, ownKeys, _SuppressedError, tslib_es6_default;
var init_tslib_es6 = __esm({
  "../../node_modules/tslib/tslib.es6.mjs"() {
    extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
        d2.__proto__ = b2;
      } || function(d2, b2) {
        for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
      };
      return extendStatics(d, b);
    };
    __assign = function() {
      __assign = Object.assign || function __assign2(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    __createBinding = Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    };
    __setModuleDefault = Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    };
    ownKeys = function(o) {
      ownKeys = Object.getOwnPropertyNames || function(o2) {
        var ar = [];
        for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
        return ar;
      };
      return ownKeys(o);
    };
    _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
      var e = new Error(message);
      return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };
    tslib_es6_default = {
      __extends,
      __assign,
      __rest,
      __decorate,
      __param,
      __esDecorate,
      __runInitializers,
      __propKey,
      __setFunctionName,
      __metadata,
      __awaiter,
      __generator,
      __createBinding,
      __exportStar,
      __values,
      __read,
      __spread,
      __spreadArrays,
      __spreadArray,
      __await,
      __asyncGenerator,
      __asyncDelegator,
      __asyncValues,
      __makeTemplateObject,
      __importStar,
      __importDefault,
      __classPrivateFieldGet,
      __classPrivateFieldSet,
      __classPrivateFieldIn,
      __addDisposableResource,
      __disposeResources,
      __rewriteRelativeImportExtension
    };
  }
});

// ../../node_modules/@supabase/functions-js/dist/main/helper.js
var require_helper = __commonJS({
  "../../node_modules/@supabase/functions-js/dist/main/helper.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveFetch = void 0;
    var resolveFetch3 = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    exports.resolveFetch = resolveFetch3;
  }
});

// ../../node_modules/@supabase/functions-js/dist/main/types.js
var require_types = __commonJS({
  "../../node_modules/@supabase/functions-js/dist/main/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FunctionRegion = exports.FunctionsHttpError = exports.FunctionsRelayError = exports.FunctionsFetchError = exports.FunctionsError = void 0;
    var FunctionsError2 = class extends Error {
      constructor(message, name = "FunctionsError", context) {
        super(message);
        this.name = name;
        this.context = context;
      }
    };
    exports.FunctionsError = FunctionsError2;
    var FunctionsFetchError2 = class extends FunctionsError2 {
      constructor(context) {
        super("Failed to send a request to the Edge Function", "FunctionsFetchError", context);
      }
    };
    exports.FunctionsFetchError = FunctionsFetchError2;
    var FunctionsRelayError2 = class extends FunctionsError2 {
      constructor(context) {
        super("Relay Error invoking the Edge Function", "FunctionsRelayError", context);
      }
    };
    exports.FunctionsRelayError = FunctionsRelayError2;
    var FunctionsHttpError2 = class extends FunctionsError2 {
      constructor(context) {
        super("Edge Function returned a non-2xx status code", "FunctionsHttpError", context);
      }
    };
    exports.FunctionsHttpError = FunctionsHttpError2;
    var FunctionRegion2;
    (function(FunctionRegion3) {
      FunctionRegion3["Any"] = "any";
      FunctionRegion3["ApNortheast1"] = "ap-northeast-1";
      FunctionRegion3["ApNortheast2"] = "ap-northeast-2";
      FunctionRegion3["ApSouth1"] = "ap-south-1";
      FunctionRegion3["ApSoutheast1"] = "ap-southeast-1";
      FunctionRegion3["ApSoutheast2"] = "ap-southeast-2";
      FunctionRegion3["CaCentral1"] = "ca-central-1";
      FunctionRegion3["EuCentral1"] = "eu-central-1";
      FunctionRegion3["EuWest1"] = "eu-west-1";
      FunctionRegion3["EuWest2"] = "eu-west-2";
      FunctionRegion3["EuWest3"] = "eu-west-3";
      FunctionRegion3["SaEast1"] = "sa-east-1";
      FunctionRegion3["UsEast1"] = "us-east-1";
      FunctionRegion3["UsWest1"] = "us-west-1";
      FunctionRegion3["UsWest2"] = "us-west-2";
    })(FunctionRegion2 || (exports.FunctionRegion = FunctionRegion2 = {}));
  }
});

// ../../node_modules/@supabase/functions-js/dist/main/FunctionsClient.js
var require_FunctionsClient = __commonJS({
  "../../node_modules/@supabase/functions-js/dist/main/FunctionsClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FunctionsClient = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var helper_1 = require_helper();
    var types_1 = require_types();
    var FunctionsClient2 = class {
      /**
       * Creates a new Functions client bound to an Edge Functions URL.
       *
       * @example
       * ```ts
       * import { FunctionsClient, FunctionRegion } from '@supabase/functions-js'
       *
       * const functions = new FunctionsClient('https://xyzcompany.supabase.co/functions/v1', {
       *   headers: { apikey: 'public-anon-key' },
       *   region: FunctionRegion.UsEast1,
       * })
       * ```
       */
      constructor(url, { headers = {}, customFetch, region = types_1.FunctionRegion.Any } = {}) {
        this.url = url;
        this.headers = headers;
        this.region = region;
        this.fetch = (0, helper_1.resolveFetch)(customFetch);
      }
      /**
       * Updates the authorization header
       * @param token - the new jwt token sent in the authorisation header
       * @example
       * ```ts
       * functions.setAuth(session.access_token)
       * ```
       */
      setAuth(token) {
        this.headers.Authorization = `Bearer ${token}`;
      }
      /**
       * Invokes a function
       * @param functionName - The name of the Function to invoke.
       * @param options - Options for invoking the Function.
       * @example
       * ```ts
       * const { data, error } = await functions.invoke('hello-world', {
       *   body: { name: 'Ada' },
       * })
       * ```
       */
      invoke(functionName_1) {
        return tslib_1.__awaiter(this, arguments, void 0, function* (functionName, options = {}) {
          var _a;
          let timeoutId;
          let timeoutController;
          try {
            const { headers, method, body: functionArgs, signal, timeout } = options;
            let _headers = {};
            let { region } = options;
            if (!region) {
              region = this.region;
            }
            const url = new URL(`${this.url}/${functionName}`);
            if (region && region !== "any") {
              _headers["x-region"] = region;
              url.searchParams.set("forceFunctionRegion", region);
            }
            let body;
            if (functionArgs && (headers && !Object.prototype.hasOwnProperty.call(headers, "Content-Type") || !headers)) {
              if (typeof Blob !== "undefined" && functionArgs instanceof Blob || functionArgs instanceof ArrayBuffer) {
                _headers["Content-Type"] = "application/octet-stream";
                body = functionArgs;
              } else if (typeof functionArgs === "string") {
                _headers["Content-Type"] = "text/plain";
                body = functionArgs;
              } else if (typeof FormData !== "undefined" && functionArgs instanceof FormData) {
                body = functionArgs;
              } else {
                _headers["Content-Type"] = "application/json";
                body = JSON.stringify(functionArgs);
              }
            } else {
              if (functionArgs && typeof functionArgs !== "string" && !(typeof Blob !== "undefined" && functionArgs instanceof Blob) && !(functionArgs instanceof ArrayBuffer) && !(typeof FormData !== "undefined" && functionArgs instanceof FormData)) {
                body = JSON.stringify(functionArgs);
              } else {
                body = functionArgs;
              }
            }
            let effectiveSignal = signal;
            if (timeout) {
              timeoutController = new AbortController();
              timeoutId = setTimeout(() => timeoutController.abort(), timeout);
              if (signal) {
                effectiveSignal = timeoutController.signal;
                signal.addEventListener("abort", () => timeoutController.abort());
              } else {
                effectiveSignal = timeoutController.signal;
              }
            }
            const response = yield this.fetch(url.toString(), {
              method: method || "POST",
              // headers priority is (high to low):
              // 1. invoke-level headers
              // 2. client-level headers
              // 3. default Content-Type header
              headers: Object.assign(Object.assign(Object.assign({}, _headers), this.headers), headers),
              body,
              signal: effectiveSignal
            }).catch((fetchError) => {
              throw new types_1.FunctionsFetchError(fetchError);
            });
            const isRelayError = response.headers.get("x-relay-error");
            if (isRelayError && isRelayError === "true") {
              throw new types_1.FunctionsRelayError(response);
            }
            if (!response.ok) {
              throw new types_1.FunctionsHttpError(response);
            }
            let responseType = ((_a = response.headers.get("Content-Type")) !== null && _a !== void 0 ? _a : "text/plain").split(";")[0].trim();
            let data;
            if (responseType === "application/json") {
              data = yield response.json();
            } else if (responseType === "application/octet-stream" || responseType === "application/pdf") {
              data = yield response.blob();
            } else if (responseType === "text/event-stream") {
              data = response;
            } else if (responseType === "multipart/form-data") {
              data = yield response.formData();
            } else {
              data = yield response.text();
            }
            return { data, error: null, response };
          } catch (error) {
            return {
              data: null,
              error,
              response: error instanceof types_1.FunctionsHttpError || error instanceof types_1.FunctionsRelayError ? error.context : void 0
            };
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        });
      }
    };
    exports.FunctionsClient = FunctionsClient2;
  }
});

// ../../node_modules/@supabase/functions-js/dist/main/index.js
var require_main = __commonJS({
  "../../node_modules/@supabase/functions-js/dist/main/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FunctionRegion = exports.FunctionsRelayError = exports.FunctionsHttpError = exports.FunctionsFetchError = exports.FunctionsError = exports.FunctionsClient = void 0;
    var FunctionsClient_1 = require_FunctionsClient();
    Object.defineProperty(exports, "FunctionsClient", { enumerable: true, get: function() {
      return FunctionsClient_1.FunctionsClient;
    } });
    var types_1 = require_types();
    Object.defineProperty(exports, "FunctionsError", { enumerable: true, get: function() {
      return types_1.FunctionsError;
    } });
    Object.defineProperty(exports, "FunctionsFetchError", { enumerable: true, get: function() {
      return types_1.FunctionsFetchError;
    } });
    Object.defineProperty(exports, "FunctionsHttpError", { enumerable: true, get: function() {
      return types_1.FunctionsHttpError;
    } });
    Object.defineProperty(exports, "FunctionsRelayError", { enumerable: true, get: function() {
      return types_1.FunctionsRelayError;
    } });
    Object.defineProperty(exports, "FunctionRegion", { enumerable: true, get: function() {
      return types_1.FunctionRegion;
    } });
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js
var require_websocket_factory = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebSocketFactory = void 0;
    var WebSocketFactory = class {
      /**
       * Static-only utility – prevent instantiation.
       */
      constructor() {
      }
      static detectEnvironment() {
        var _a;
        if (typeof WebSocket !== "undefined") {
          return { type: "native", constructor: WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocket !== "undefined") {
          return { type: "native", constructor: globalThis.WebSocket };
        }
        if (typeof global !== "undefined" && typeof global.WebSocket !== "undefined") {
          return { type: "native", constructor: global.WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocketPair !== "undefined" && typeof globalThis.WebSocket === "undefined") {
          return {
            type: "cloudflare",
            error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.",
            workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime."
          };
        }
        if (typeof globalThis !== "undefined" && globalThis.EdgeRuntime || typeof navigator !== "undefined" && ((_a = navigator.userAgent) === null || _a === void 0 ? void 0 : _a.includes("Vercel-Edge"))) {
          return {
            type: "unsupported",
            error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.",
            workaround: "Use serverless functions or a different deployment target for WebSocket functionality."
          };
        }
        const _process = globalThis["process"];
        if (_process) {
          const processVersions = _process["versions"];
          if (processVersions && processVersions["node"]) {
            const versionString = processVersions["node"];
            const nodeVersion = parseInt(versionString.replace(/^v/, "").split(".")[0]);
            if (nodeVersion >= 22) {
              if (typeof globalThis.WebSocket !== "undefined") {
                return { type: "native", constructor: globalThis.WebSocket };
              }
              return {
                type: "unsupported",
                error: `Node.js ${nodeVersion} detected but native WebSocket not found.`,
                workaround: "Provide a WebSocket implementation via the transport option."
              };
            }
            return {
              type: "unsupported",
              error: `Node.js ${nodeVersion} detected without native WebSocket support.`,
              workaround: 'For Node.js < 22, install "ws" package and provide it via the transport option:\nimport ws from "ws"\nnew RealtimeClient(url, { transport: ws })'
            };
          }
        }
        return {
          type: "unsupported",
          error: "Unknown JavaScript runtime without WebSocket support.",
          workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation."
        };
      }
      /**
       * Returns the best available WebSocket constructor for the current runtime.
       *
       * @example
       * ```ts
       * const WS = WebSocketFactory.getWebSocketConstructor()
       * const socket = new WS('wss://realtime.supabase.co/socket')
       * ```
       */
      static getWebSocketConstructor() {
        const env = this.detectEnvironment();
        if (env.constructor) {
          return env.constructor;
        }
        let errorMessage = env.error || "WebSocket not supported in this environment.";
        if (env.workaround) {
          errorMessage += `

Suggested solution: ${env.workaround}`;
        }
        throw new Error(errorMessage);
      }
      /**
       * Creates a WebSocket using the detected constructor.
       *
       * @example
       * ```ts
       * const socket = WebSocketFactory.createWebSocket('wss://realtime.supabase.co/socket')
       * ```
       */
      static createWebSocket(url, protocols) {
        const WS = this.getWebSocketConstructor();
        return new WS(url, protocols);
      }
      /**
       * Detects whether the runtime can establish WebSocket connections.
       *
       * @example
       * ```ts
       * if (!WebSocketFactory.isWebSocketSupported()) {
       *   console.warn('Falling back to long polling')
       * }
       * ```
       */
      static isWebSocketSupported() {
        try {
          const env = this.detectEnvironment();
          return env.type === "native" || env.type === "ws";
        } catch (_a) {
          return false;
        }
      }
    };
    exports.WebSocketFactory = WebSocketFactory;
    exports.default = WebSocketFactory;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/lib/version.js
var require_version = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/lib/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "2.98.0";
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/lib/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CONNECTION_STATE = exports.TRANSPORTS = exports.CHANNEL_EVENTS = exports.CHANNEL_STATES = exports.SOCKET_STATES = exports.MAX_PUSH_BUFFER_SIZE = exports.WS_CLOSE_NORMAL = exports.DEFAULT_TIMEOUT = exports.VERSION = exports.DEFAULT_VSN = exports.VSN_2_0_0 = exports.VSN_1_0_0 = exports.DEFAULT_VERSION = void 0;
    var version_1 = require_version();
    exports.DEFAULT_VERSION = `realtime-js/${version_1.version}`;
    exports.VSN_1_0_0 = "1.0.0";
    exports.VSN_2_0_0 = "2.0.0";
    exports.DEFAULT_VSN = exports.VSN_2_0_0;
    exports.VERSION = version_1.version;
    exports.DEFAULT_TIMEOUT = 1e4;
    exports.WS_CLOSE_NORMAL = 1e3;
    exports.MAX_PUSH_BUFFER_SIZE = 100;
    var SOCKET_STATES;
    (function(SOCKET_STATES2) {
      SOCKET_STATES2[SOCKET_STATES2["connecting"] = 0] = "connecting";
      SOCKET_STATES2[SOCKET_STATES2["open"] = 1] = "open";
      SOCKET_STATES2[SOCKET_STATES2["closing"] = 2] = "closing";
      SOCKET_STATES2[SOCKET_STATES2["closed"] = 3] = "closed";
    })(SOCKET_STATES || (exports.SOCKET_STATES = SOCKET_STATES = {}));
    var CHANNEL_STATES;
    (function(CHANNEL_STATES2) {
      CHANNEL_STATES2["closed"] = "closed";
      CHANNEL_STATES2["errored"] = "errored";
      CHANNEL_STATES2["joined"] = "joined";
      CHANNEL_STATES2["joining"] = "joining";
      CHANNEL_STATES2["leaving"] = "leaving";
    })(CHANNEL_STATES || (exports.CHANNEL_STATES = CHANNEL_STATES = {}));
    var CHANNEL_EVENTS;
    (function(CHANNEL_EVENTS2) {
      CHANNEL_EVENTS2["close"] = "phx_close";
      CHANNEL_EVENTS2["error"] = "phx_error";
      CHANNEL_EVENTS2["join"] = "phx_join";
      CHANNEL_EVENTS2["reply"] = "phx_reply";
      CHANNEL_EVENTS2["leave"] = "phx_leave";
      CHANNEL_EVENTS2["access_token"] = "access_token";
    })(CHANNEL_EVENTS || (exports.CHANNEL_EVENTS = CHANNEL_EVENTS = {}));
    var TRANSPORTS;
    (function(TRANSPORTS2) {
      TRANSPORTS2["websocket"] = "websocket";
    })(TRANSPORTS || (exports.TRANSPORTS = TRANSPORTS = {}));
    var CONNECTION_STATE;
    (function(CONNECTION_STATE2) {
      CONNECTION_STATE2["Connecting"] = "connecting";
      CONNECTION_STATE2["Open"] = "open";
      CONNECTION_STATE2["Closing"] = "closing";
      CONNECTION_STATE2["Closed"] = "closed";
    })(CONNECTION_STATE || (exports.CONNECTION_STATE = CONNECTION_STATE = {}));
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/lib/serializer.js
var require_serializer = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/lib/serializer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Serializer = class {
      constructor(allowedMetadataKeys) {
        this.HEADER_LENGTH = 1;
        this.USER_BROADCAST_PUSH_META_LENGTH = 6;
        this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 };
        this.BINARY_ENCODING = 0;
        this.JSON_ENCODING = 1;
        this.BROADCAST_EVENT = "broadcast";
        this.allowedMetadataKeys = [];
        this.allowedMetadataKeys = allowedMetadataKeys !== null && allowedMetadataKeys !== void 0 ? allowedMetadataKeys : [];
      }
      encode(msg, callback) {
        if (msg.event === this.BROADCAST_EVENT && !(msg.payload instanceof ArrayBuffer) && typeof msg.payload.event === "string") {
          return callback(this._binaryEncodeUserBroadcastPush(msg));
        }
        let payload = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
        return callback(JSON.stringify(payload));
      }
      _binaryEncodeUserBroadcastPush(message) {
        var _a;
        if (this._isArrayBuffer((_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload)) {
          return this._encodeBinaryUserBroadcastPush(message);
        } else {
          return this._encodeJsonUserBroadcastPush(message);
        }
      }
      _encodeBinaryUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : new ArrayBuffer(0);
        return this._encodeUserBroadcastPush(message, this.BINARY_ENCODING, userPayload);
      }
      _encodeJsonUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : {};
        const encoder = new TextEncoder();
        const encodedUserPayload = encoder.encode(JSON.stringify(userPayload)).buffer;
        return this._encodeUserBroadcastPush(message, this.JSON_ENCODING, encodedUserPayload);
      }
      _encodeUserBroadcastPush(message, encodingType, encodedPayload) {
        var _a, _b;
        const topic = message.topic;
        const ref = (_a = message.ref) !== null && _a !== void 0 ? _a : "";
        const joinRef = (_b = message.join_ref) !== null && _b !== void 0 ? _b : "";
        const userEvent = message.payload.event;
        const rest = this.allowedMetadataKeys ? this._pick(message.payload, this.allowedMetadataKeys) : {};
        const metadata = Object.keys(rest).length === 0 ? "" : JSON.stringify(rest);
        if (joinRef.length > 255) {
          throw new Error(`joinRef length ${joinRef.length} exceeds maximum of 255`);
        }
        if (ref.length > 255) {
          throw new Error(`ref length ${ref.length} exceeds maximum of 255`);
        }
        if (topic.length > 255) {
          throw new Error(`topic length ${topic.length} exceeds maximum of 255`);
        }
        if (userEvent.length > 255) {
          throw new Error(`userEvent length ${userEvent.length} exceeds maximum of 255`);
        }
        if (metadata.length > 255) {
          throw new Error(`metadata length ${metadata.length} exceeds maximum of 255`);
        }
        const metaLength = this.USER_BROADCAST_PUSH_META_LENGTH + joinRef.length + ref.length + topic.length + userEvent.length + metadata.length;
        const header = new ArrayBuffer(this.HEADER_LENGTH + metaLength);
        let view = new DataView(header);
        let offset = 0;
        view.setUint8(offset++, this.KINDS.userBroadcastPush);
        view.setUint8(offset++, joinRef.length);
        view.setUint8(offset++, ref.length);
        view.setUint8(offset++, topic.length);
        view.setUint8(offset++, userEvent.length);
        view.setUint8(offset++, metadata.length);
        view.setUint8(offset++, encodingType);
        Array.from(joinRef, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(ref, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(topic, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(userEvent, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(metadata, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        var combined = new Uint8Array(header.byteLength + encodedPayload.byteLength);
        combined.set(new Uint8Array(header), 0);
        combined.set(new Uint8Array(encodedPayload), header.byteLength);
        return combined.buffer;
      }
      decode(rawPayload, callback) {
        if (this._isArrayBuffer(rawPayload)) {
          let result = this._binaryDecode(rawPayload);
          return callback(result);
        }
        if (typeof rawPayload === "string") {
          const jsonPayload = JSON.parse(rawPayload);
          const [join_ref, ref, topic, event, payload] = jsonPayload;
          return callback({ join_ref, ref, topic, event, payload });
        }
        return callback({});
      }
      _binaryDecode(buffer) {
        const view = new DataView(buffer);
        const kind = view.getUint8(0);
        const decoder = new TextDecoder();
        switch (kind) {
          case this.KINDS.userBroadcast:
            return this._decodeUserBroadcast(buffer, view, decoder);
        }
      }
      _decodeUserBroadcast(buffer, view, decoder) {
        const topicSize = view.getUint8(1);
        const userEventSize = view.getUint8(2);
        const metadataSize = view.getUint8(3);
        const payloadEncoding = view.getUint8(4);
        let offset = this.HEADER_LENGTH + 4;
        const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
        offset = offset + topicSize;
        const userEvent = decoder.decode(buffer.slice(offset, offset + userEventSize));
        offset = offset + userEventSize;
        const metadata = decoder.decode(buffer.slice(offset, offset + metadataSize));
        offset = offset + metadataSize;
        const payload = buffer.slice(offset, buffer.byteLength);
        const parsedPayload = payloadEncoding === this.JSON_ENCODING ? JSON.parse(decoder.decode(payload)) : payload;
        const data = {
          type: this.BROADCAST_EVENT,
          event: userEvent,
          payload: parsedPayload
        };
        if (metadataSize > 0) {
          data["meta"] = JSON.parse(metadata);
        }
        return { join_ref: null, ref: null, topic, event: this.BROADCAST_EVENT, payload: data };
      }
      _isArrayBuffer(buffer) {
        var _a;
        return buffer instanceof ArrayBuffer || ((_a = buffer === null || buffer === void 0 ? void 0 : buffer.constructor) === null || _a === void 0 ? void 0 : _a.name) === "ArrayBuffer";
      }
      _pick(obj, keys) {
        if (!obj || typeof obj !== "object") {
          return {};
        }
        return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
      }
    };
    exports.default = Serializer;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/lib/timer.js
var require_timer = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/lib/timer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Timer = class {
      constructor(callback, timerCalc) {
        this.callback = callback;
        this.timerCalc = timerCalc;
        this.timer = void 0;
        this.tries = 0;
        this.callback = callback;
        this.timerCalc = timerCalc;
      }
      reset() {
        this.tries = 0;
        clearTimeout(this.timer);
        this.timer = void 0;
      }
      // Cancels any previous scheduleTimeout and schedules callback
      scheduleTimeout() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.tries = this.tries + 1;
          this.callback();
        }, this.timerCalc(this.tries + 1));
      }
    };
    exports.default = Timer;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/lib/transformers.js
var require_transformers = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/lib/transformers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.httpEndpointURL = exports.toTimestampString = exports.toArray = exports.toJson = exports.toNumber = exports.toBoolean = exports.convertCell = exports.convertColumn = exports.convertChangeData = exports.PostgresTypes = void 0;
    var PostgresTypes;
    (function(PostgresTypes2) {
      PostgresTypes2["abstime"] = "abstime";
      PostgresTypes2["bool"] = "bool";
      PostgresTypes2["date"] = "date";
      PostgresTypes2["daterange"] = "daterange";
      PostgresTypes2["float4"] = "float4";
      PostgresTypes2["float8"] = "float8";
      PostgresTypes2["int2"] = "int2";
      PostgresTypes2["int4"] = "int4";
      PostgresTypes2["int4range"] = "int4range";
      PostgresTypes2["int8"] = "int8";
      PostgresTypes2["int8range"] = "int8range";
      PostgresTypes2["json"] = "json";
      PostgresTypes2["jsonb"] = "jsonb";
      PostgresTypes2["money"] = "money";
      PostgresTypes2["numeric"] = "numeric";
      PostgresTypes2["oid"] = "oid";
      PostgresTypes2["reltime"] = "reltime";
      PostgresTypes2["text"] = "text";
      PostgresTypes2["time"] = "time";
      PostgresTypes2["timestamp"] = "timestamp";
      PostgresTypes2["timestamptz"] = "timestamptz";
      PostgresTypes2["timetz"] = "timetz";
      PostgresTypes2["tsrange"] = "tsrange";
      PostgresTypes2["tstzrange"] = "tstzrange";
    })(PostgresTypes || (exports.PostgresTypes = PostgresTypes = {}));
    var convertChangeData = (columns, record, options = {}) => {
      var _a;
      const skipTypes = (_a = options.skipTypes) !== null && _a !== void 0 ? _a : [];
      if (!record) {
        return {};
      }
      return Object.keys(record).reduce((acc, rec_key) => {
        acc[rec_key] = (0, exports.convertColumn)(rec_key, columns, record, skipTypes);
        return acc;
      }, {});
    };
    exports.convertChangeData = convertChangeData;
    var convertColumn = (columnName, columns, record, skipTypes) => {
      const column = columns.find((x) => x.name === columnName);
      const colType = column === null || column === void 0 ? void 0 : column.type;
      const value = record[columnName];
      if (colType && !skipTypes.includes(colType)) {
        return (0, exports.convertCell)(colType, value);
      }
      return noop(value);
    };
    exports.convertColumn = convertColumn;
    var convertCell = (type, value) => {
      if (type.charAt(0) === "_") {
        const dataType = type.slice(1, type.length);
        return (0, exports.toArray)(value, dataType);
      }
      switch (type) {
        case PostgresTypes.bool:
          return (0, exports.toBoolean)(value);
        case PostgresTypes.float4:
        case PostgresTypes.float8:
        case PostgresTypes.int2:
        case PostgresTypes.int4:
        case PostgresTypes.int8:
        case PostgresTypes.numeric:
        case PostgresTypes.oid:
          return (0, exports.toNumber)(value);
        case PostgresTypes.json:
        case PostgresTypes.jsonb:
          return (0, exports.toJson)(value);
        case PostgresTypes.timestamp:
          return (0, exports.toTimestampString)(value);
        // Format to be consistent with PostgREST
        case PostgresTypes.abstime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.date:
        // To allow users to cast it based on Timezone
        case PostgresTypes.daterange:
        case PostgresTypes.int4range:
        case PostgresTypes.int8range:
        case PostgresTypes.money:
        case PostgresTypes.reltime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.text:
        case PostgresTypes.time:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timestamptz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timetz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.tsrange:
        case PostgresTypes.tstzrange:
          return noop(value);
        default:
          return noop(value);
      }
    };
    exports.convertCell = convertCell;
    var noop = (value) => {
      return value;
    };
    var toBoolean = (value) => {
      switch (value) {
        case "t":
          return true;
        case "f":
          return false;
        default:
          return value;
      }
    };
    exports.toBoolean = toBoolean;
    var toNumber = (value) => {
      if (typeof value === "string") {
        const parsedValue = parseFloat(value);
        if (!Number.isNaN(parsedValue)) {
          return parsedValue;
        }
      }
      return value;
    };
    exports.toNumber = toNumber;
    var toJson = (value) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (_a) {
          return value;
        }
      }
      return value;
    };
    exports.toJson = toJson;
    var toArray = (value, type) => {
      if (typeof value !== "string") {
        return value;
      }
      const lastIdx = value.length - 1;
      const closeBrace = value[lastIdx];
      const openBrace = value[0];
      if (openBrace === "{" && closeBrace === "}") {
        let arr;
        const valTrim = value.slice(1, lastIdx);
        try {
          arr = JSON.parse("[" + valTrim + "]");
        } catch (_) {
          arr = valTrim ? valTrim.split(",") : [];
        }
        return arr.map((val) => (0, exports.convertCell)(type, val));
      }
      return value;
    };
    exports.toArray = toArray;
    var toTimestampString = (value) => {
      if (typeof value === "string") {
        return value.replace(" ", "T");
      }
      return value;
    };
    exports.toTimestampString = toTimestampString;
    var httpEndpointURL = (socketUrl) => {
      const wsUrl = new URL(socketUrl);
      wsUrl.protocol = wsUrl.protocol.replace(/^ws/i, "http");
      wsUrl.pathname = wsUrl.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, "");
      if (wsUrl.pathname === "" || wsUrl.pathname === "/") {
        wsUrl.pathname = "/api/broadcast";
      } else {
        wsUrl.pathname = wsUrl.pathname + "/api/broadcast";
      }
      return wsUrl.href;
    };
    exports.httpEndpointURL = httpEndpointURL;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/lib/push.js
var require_push = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/lib/push.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var constants_1 = require_constants();
    var Push = class {
      /**
       * Initializes the Push
       *
       * @param channel The Channel
       * @param event The event, for example `"phx_join"`
       * @param payload The payload, for example `{user_id: 123}`
       * @param timeout The push timeout in milliseconds
       */
      constructor(channel, event, payload = {}, timeout = constants_1.DEFAULT_TIMEOUT) {
        this.channel = channel;
        this.event = event;
        this.payload = payload;
        this.timeout = timeout;
        this.sent = false;
        this.timeoutTimer = void 0;
        this.ref = "";
        this.receivedResp = null;
        this.recHooks = [];
        this.refEvent = null;
      }
      resend(timeout) {
        this.timeout = timeout;
        this._cancelRefEvent();
        this.ref = "";
        this.refEvent = null;
        this.receivedResp = null;
        this.sent = false;
        this.send();
      }
      send() {
        if (this._hasReceived("timeout")) {
          return;
        }
        this.startTimeout();
        this.sent = true;
        this.channel.socket.push({
          topic: this.channel.topic,
          event: this.event,
          payload: this.payload,
          ref: this.ref,
          join_ref: this.channel._joinRef()
        });
      }
      updatePayload(payload) {
        this.payload = Object.assign(Object.assign({}, this.payload), payload);
      }
      receive(status, callback) {
        var _a;
        if (this._hasReceived(status)) {
          callback((_a = this.receivedResp) === null || _a === void 0 ? void 0 : _a.response);
        }
        this.recHooks.push({ status, callback });
        return this;
      }
      startTimeout() {
        if (this.timeoutTimer) {
          return;
        }
        this.ref = this.channel.socket._makeRef();
        this.refEvent = this.channel._replyEventName(this.ref);
        const callback = (payload) => {
          this._cancelRefEvent();
          this._cancelTimeout();
          this.receivedResp = payload;
          this._matchReceive(payload);
        };
        this.channel._on(this.refEvent, {}, callback);
        this.timeoutTimer = setTimeout(() => {
          this.trigger("timeout", {});
        }, this.timeout);
      }
      trigger(status, response) {
        if (this.refEvent)
          this.channel._trigger(this.refEvent, { status, response });
      }
      destroy() {
        this._cancelRefEvent();
        this._cancelTimeout();
      }
      _cancelRefEvent() {
        if (!this.refEvent) {
          return;
        }
        this.channel._off(this.refEvent, {});
      }
      _cancelTimeout() {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = void 0;
      }
      _matchReceive({ status, response }) {
        this.recHooks.filter((h) => h.status === status).forEach((h) => h.callback(response));
      }
      _hasReceived(status) {
        return this.receivedResp && this.receivedResp.status === status;
      }
    };
    exports.default = Push;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/RealtimePresence.js
var require_RealtimePresence = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/RealtimePresence.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.REALTIME_PRESENCE_LISTEN_EVENTS = void 0;
    var REALTIME_PRESENCE_LISTEN_EVENTS;
    (function(REALTIME_PRESENCE_LISTEN_EVENTS2) {
      REALTIME_PRESENCE_LISTEN_EVENTS2["SYNC"] = "sync";
      REALTIME_PRESENCE_LISTEN_EVENTS2["JOIN"] = "join";
      REALTIME_PRESENCE_LISTEN_EVENTS2["LEAVE"] = "leave";
    })(REALTIME_PRESENCE_LISTEN_EVENTS || (exports.REALTIME_PRESENCE_LISTEN_EVENTS = REALTIME_PRESENCE_LISTEN_EVENTS = {}));
    var RealtimePresence = class _RealtimePresence {
      /**
       * Creates a Presence helper that keeps the local presence state in sync with the server.
       *
       * @param channel - The realtime channel to bind to.
       * @param opts - Optional custom event names, e.g. `{ events: { state: 'state', diff: 'diff' } }`.
       *
       * @example
       * ```ts
       * const presence = new RealtimePresence(channel)
       *
       * channel.on('presence', ({ event, key }) => {
       *   console.log(`Presence ${event} on ${key}`)
       * })
       * ```
       */
      constructor(channel, opts) {
        this.channel = channel;
        this.state = {};
        this.pendingDiffs = [];
        this.joinRef = null;
        this.enabled = false;
        this.caller = {
          onJoin: () => {
          },
          onLeave: () => {
          },
          onSync: () => {
          }
        };
        const events = (opts === null || opts === void 0 ? void 0 : opts.events) || {
          state: "presence_state",
          diff: "presence_diff"
        };
        this.channel._on(events.state, {}, (newState) => {
          const { onJoin, onLeave, onSync } = this.caller;
          this.joinRef = this.channel._joinRef();
          this.state = _RealtimePresence.syncState(this.state, newState, onJoin, onLeave);
          this.pendingDiffs.forEach((diff) => {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
          });
          this.pendingDiffs = [];
          onSync();
        });
        this.channel._on(events.diff, {}, (diff) => {
          const { onJoin, onLeave, onSync } = this.caller;
          if (this.inPendingSyncState()) {
            this.pendingDiffs.push(diff);
          } else {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
            onSync();
          }
        });
        this.onJoin((key, currentPresences, newPresences) => {
          this.channel._trigger("presence", {
            event: "join",
            key,
            currentPresences,
            newPresences
          });
        });
        this.onLeave((key, currentPresences, leftPresences) => {
          this.channel._trigger("presence", {
            event: "leave",
            key,
            currentPresences,
            leftPresences
          });
        });
        this.onSync(() => {
          this.channel._trigger("presence", { event: "sync" });
        });
      }
      /**
       * Used to sync the list of presences on the server with the
       * client's state.
       *
       * An optional `onJoin` and `onLeave` callback can be provided to
       * react to changes in the client's local presences across
       * disconnects and reconnects with the server.
       *
       * @internal
       */
      static syncState(currentState, newState, onJoin, onLeave) {
        const state = this.cloneDeep(currentState);
        const transformedState = this.transformState(newState);
        const joins = {};
        const leaves = {};
        this.map(state, (key, presences) => {
          if (!transformedState[key]) {
            leaves[key] = presences;
          }
        });
        this.map(transformedState, (key, newPresences) => {
          const currentPresences = state[key];
          if (currentPresences) {
            const newPresenceRefs = newPresences.map((m) => m.presence_ref);
            const curPresenceRefs = currentPresences.map((m) => m.presence_ref);
            const joinedPresences = newPresences.filter((m) => curPresenceRefs.indexOf(m.presence_ref) < 0);
            const leftPresences = currentPresences.filter((m) => newPresenceRefs.indexOf(m.presence_ref) < 0);
            if (joinedPresences.length > 0) {
              joins[key] = joinedPresences;
            }
            if (leftPresences.length > 0) {
              leaves[key] = leftPresences;
            }
          } else {
            joins[key] = newPresences;
          }
        });
        return this.syncDiff(state, { joins, leaves }, onJoin, onLeave);
      }
      /**
       * Used to sync a diff of presence join and leave events from the
       * server, as they happen.
       *
       * Like `syncState`, `syncDiff` accepts optional `onJoin` and
       * `onLeave` callbacks to react to a user joining or leaving from a
       * device.
       *
       * @internal
       */
      static syncDiff(state, diff, onJoin, onLeave) {
        const { joins, leaves } = {
          joins: this.transformState(diff.joins),
          leaves: this.transformState(diff.leaves)
        };
        if (!onJoin) {
          onJoin = () => {
          };
        }
        if (!onLeave) {
          onLeave = () => {
          };
        }
        this.map(joins, (key, newPresences) => {
          var _a;
          const currentPresences = (_a = state[key]) !== null && _a !== void 0 ? _a : [];
          state[key] = this.cloneDeep(newPresences);
          if (currentPresences.length > 0) {
            const joinedPresenceRefs = state[key].map((m) => m.presence_ref);
            const curPresences = currentPresences.filter((m) => joinedPresenceRefs.indexOf(m.presence_ref) < 0);
            state[key].unshift(...curPresences);
          }
          onJoin(key, currentPresences, newPresences);
        });
        this.map(leaves, (key, leftPresences) => {
          let currentPresences = state[key];
          if (!currentPresences)
            return;
          const presenceRefsToRemove = leftPresences.map((m) => m.presence_ref);
          currentPresences = currentPresences.filter((m) => presenceRefsToRemove.indexOf(m.presence_ref) < 0);
          state[key] = currentPresences;
          onLeave(key, currentPresences, leftPresences);
          if (currentPresences.length === 0)
            delete state[key];
        });
        return state;
      }
      /** @internal */
      static map(obj, func) {
        return Object.getOwnPropertyNames(obj).map((key) => func(key, obj[key]));
      }
      /**
       * Remove 'metas' key
       * Change 'phx_ref' to 'presence_ref'
       * Remove 'phx_ref' and 'phx_ref_prev'
       *
       * @example
       * // returns {
       *  abc123: [
       *    { presence_ref: '2', user_id: 1 },
       *    { presence_ref: '3', user_id: 2 }
       *  ]
       * }
       * RealtimePresence.transformState({
       *  abc123: {
       *    metas: [
       *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
       *      { phx_ref: '3', user_id: 2 }
       *    ]
       *  }
       * })
       *
       * @internal
       */
      static transformState(state) {
        state = this.cloneDeep(state);
        return Object.getOwnPropertyNames(state).reduce((newState, key) => {
          const presences = state[key];
          if ("metas" in presences) {
            newState[key] = presences.metas.map((presence) => {
              presence["presence_ref"] = presence["phx_ref"];
              delete presence["phx_ref"];
              delete presence["phx_ref_prev"];
              return presence;
            });
          } else {
            newState[key] = presences;
          }
          return newState;
        }, {});
      }
      /** @internal */
      static cloneDeep(obj) {
        return JSON.parse(JSON.stringify(obj));
      }
      /** @internal */
      onJoin(callback) {
        this.caller.onJoin = callback;
      }
      /** @internal */
      onLeave(callback) {
        this.caller.onLeave = callback;
      }
      /** @internal */
      onSync(callback) {
        this.caller.onSync = callback;
      }
      /** @internal */
      inPendingSyncState() {
        return !this.joinRef || this.joinRef !== this.channel._joinRef();
      }
    };
    exports.default = RealtimePresence;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js
var require_RealtimeChannel = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.REALTIME_CHANNEL_STATES = exports.REALTIME_SUBSCRIBE_STATES = exports.REALTIME_LISTEN_TYPES = exports.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var constants_1 = require_constants();
    var push_1 = tslib_1.__importDefault(require_push());
    var timer_1 = tslib_1.__importDefault(require_timer());
    var RealtimePresence_1 = tslib_1.__importDefault(require_RealtimePresence());
    var Transformers = tslib_1.__importStar(require_transformers());
    var transformers_1 = require_transformers();
    var REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
    (function(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2) {
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["ALL"] = "*";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["INSERT"] = "INSERT";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["UPDATE"] = "UPDATE";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["DELETE"] = "DELETE";
    })(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT || (exports.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {}));
    var REALTIME_LISTEN_TYPES;
    (function(REALTIME_LISTEN_TYPES2) {
      REALTIME_LISTEN_TYPES2["BROADCAST"] = "broadcast";
      REALTIME_LISTEN_TYPES2["PRESENCE"] = "presence";
      REALTIME_LISTEN_TYPES2["POSTGRES_CHANGES"] = "postgres_changes";
      REALTIME_LISTEN_TYPES2["SYSTEM"] = "system";
    })(REALTIME_LISTEN_TYPES || (exports.REALTIME_LISTEN_TYPES = REALTIME_LISTEN_TYPES = {}));
    var REALTIME_SUBSCRIBE_STATES;
    (function(REALTIME_SUBSCRIBE_STATES2) {
      REALTIME_SUBSCRIBE_STATES2["SUBSCRIBED"] = "SUBSCRIBED";
      REALTIME_SUBSCRIBE_STATES2["TIMED_OUT"] = "TIMED_OUT";
      REALTIME_SUBSCRIBE_STATES2["CLOSED"] = "CLOSED";
      REALTIME_SUBSCRIBE_STATES2["CHANNEL_ERROR"] = "CHANNEL_ERROR";
    })(REALTIME_SUBSCRIBE_STATES || (exports.REALTIME_SUBSCRIBE_STATES = REALTIME_SUBSCRIBE_STATES = {}));
    exports.REALTIME_CHANNEL_STATES = constants_1.CHANNEL_STATES;
    var RealtimeChannel = class _RealtimeChannel {
      /**
       * Creates a channel that can broadcast messages, sync presence, and listen to Postgres changes.
       *
       * The topic determines which realtime stream you are subscribing to. Config options let you
       * enable acknowledgement for broadcasts, presence tracking, or private channels.
       *
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * const channel = new RealtimeChannel('realtime:public:messages', { config: {} }, client)
       * ```
       */
      constructor(topic, params = { config: {} }, socket) {
        var _a, _b;
        this.topic = topic;
        this.params = params;
        this.socket = socket;
        this.bindings = {};
        this.state = constants_1.CHANNEL_STATES.closed;
        this.joinedOnce = false;
        this.pushBuffer = [];
        this.subTopic = topic.replace(/^realtime:/i, "");
        this.params.config = Object.assign({
          broadcast: { ack: false, self: false },
          presence: { key: "", enabled: false },
          private: false
        }, params.config);
        this.timeout = this.socket.timeout;
        this.joinPush = new push_1.default(this, constants_1.CHANNEL_EVENTS.join, this.params, this.timeout);
        this.rejoinTimer = new timer_1.default(() => this._rejoinUntilConnected(), this.socket.reconnectAfterMs);
        this.joinPush.receive("ok", () => {
          this.state = constants_1.CHANNEL_STATES.joined;
          this.rejoinTimer.reset();
          this.pushBuffer.forEach((pushEvent) => pushEvent.send());
          this.pushBuffer = [];
        });
        this._onClose(() => {
          this.rejoinTimer.reset();
          this.socket.log("channel", `close ${this.topic} ${this._joinRef()}`);
          this.state = constants_1.CHANNEL_STATES.closed;
          this.socket._remove(this);
        });
        this._onError((reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("timeout", () => {
          if (!this._isJoining()) {
            return;
          }
          this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("error", (reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this._on(constants_1.CHANNEL_EVENTS.reply, {}, (payload, ref) => {
          this._trigger(this._replyEventName(ref), payload);
        });
        this.presence = new RealtimePresence_1.default(this);
        this.broadcastEndpointURL = (0, transformers_1.httpEndpointURL)(this.socket.endPoint);
        this.private = this.params.config.private || false;
        if (!this.private && ((_b = (_a = this.params.config) === null || _a === void 0 ? void 0 : _a.broadcast) === null || _b === void 0 ? void 0 : _b.replay)) {
          throw `tried to use replay on public channel '${this.topic}'. It must be a private channel.`;
        }
      }
      /** Subscribe registers your client with the server */
      subscribe(callback, timeout = this.timeout) {
        var _a, _b, _c;
        if (!this.socket.isConnected()) {
          this.socket.connect();
        }
        if (this.state == constants_1.CHANNEL_STATES.closed) {
          const { config: { broadcast, presence, private: isPrivate } } = this.params;
          const postgres_changes = (_b = (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.map((r) => r.filter)) !== null && _b !== void 0 ? _b : [];
          const presence_enabled = !!this.bindings[REALTIME_LISTEN_TYPES.PRESENCE] && this.bindings[REALTIME_LISTEN_TYPES.PRESENCE].length > 0 || ((_c = this.params.config.presence) === null || _c === void 0 ? void 0 : _c.enabled) === true;
          const accessTokenPayload = {};
          const config = {
            broadcast,
            presence: Object.assign(Object.assign({}, presence), { enabled: presence_enabled }),
            postgres_changes,
            private: isPrivate
          };
          if (this.socket.accessTokenValue) {
            accessTokenPayload.access_token = this.socket.accessTokenValue;
          }
          this._onError((e) => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, e));
          this._onClose(() => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CLOSED));
          this.updateJoinPayload(Object.assign({ config }, accessTokenPayload));
          this.joinedOnce = true;
          this._rejoin(timeout);
          this.joinPush.receive("ok", async ({ postgres_changes: postgres_changes2 }) => {
            var _a2;
            if (!this.socket._isManualToken()) {
              this.socket.setAuth();
            }
            if (postgres_changes2 === void 0) {
              callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
              return;
            } else {
              const clientPostgresBindings = this.bindings.postgres_changes;
              const bindingsLen = (_a2 = clientPostgresBindings === null || clientPostgresBindings === void 0 ? void 0 : clientPostgresBindings.length) !== null && _a2 !== void 0 ? _a2 : 0;
              const newPostgresBindings = [];
              for (let i = 0; i < bindingsLen; i++) {
                const clientPostgresBinding = clientPostgresBindings[i];
                const { filter: { event, schema, table, filter } } = clientPostgresBinding;
                const serverPostgresFilter = postgres_changes2 && postgres_changes2[i];
                if (serverPostgresFilter && serverPostgresFilter.event === event && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.schema, schema) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.table, table) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.filter, filter)) {
                  newPostgresBindings.push(Object.assign(Object.assign({}, clientPostgresBinding), { id: serverPostgresFilter.id }));
                } else {
                  this.unsubscribe();
                  this.state = constants_1.CHANNEL_STATES.errored;
                  callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
                  return;
                }
              }
              this.bindings.postgres_changes = newPostgresBindings;
              callback && callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
              return;
            }
          }).receive("error", (error) => {
            this.state = constants_1.CHANNEL_STATES.errored;
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error(JSON.stringify(Object.values(error).join(", ") || "error")));
            return;
          }).receive("timeout", () => {
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.TIMED_OUT);
            return;
          });
        }
        return this;
      }
      /**
       * Returns the current presence state for this channel.
       *
       * The shape is a map keyed by presence key (for example a user id) where each entry contains the
       * tracked metadata for that user.
       */
      presenceState() {
        return this.presence.state;
      }
      /**
       * Sends the supplied payload to the presence tracker so other subscribers can see that this
       * client is online. Use `untrack` to stop broadcasting presence for the same key.
       */
      async track(payload, opts = {}) {
        return await this.send({
          type: "presence",
          event: "track",
          payload
        }, opts.timeout || this.timeout);
      }
      /**
       * Removes the current presence state for this client.
       */
      async untrack(opts = {}) {
        return await this.send({
          type: "presence",
          event: "untrack"
        }, opts);
      }
      on(type, filter, callback) {
        if (this.state === constants_1.CHANNEL_STATES.joined && type === REALTIME_LISTEN_TYPES.PRESENCE) {
          this.socket.log("channel", `resubscribe to ${this.topic} due to change in presence callbacks on joined channel`);
          this.unsubscribe().then(async () => await this.subscribe());
        }
        return this._on(type, filter, callback);
      }
      /**
       * Sends a broadcast message explicitly via REST API.
       *
       * This method always uses the REST API endpoint regardless of WebSocket connection state.
       * Useful when you want to guarantee REST delivery or when gradually migrating from implicit REST fallback.
       *
       * @param event The name of the broadcast event
       * @param payload Payload to be sent (required)
       * @param opts Options including timeout
       * @returns Promise resolving to object with success status, and error details if failed
       */
      async httpSend(event, payload, opts = {}) {
        var _a;
        if (payload === void 0 || payload === null) {
          return Promise.reject("Payload is required for httpSend()");
        }
        const headers = {
          apikey: this.socket.apiKey ? this.socket.apiKey : "",
          "Content-Type": "application/json"
        };
        if (this.socket.accessTokenValue) {
          headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
        }
        const options = {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: [
              {
                topic: this.subTopic,
                event,
                payload,
                private: this.private
              }
            ]
          })
        };
        const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
        if (response.status === 202) {
          return { success: true };
        }
        let errorMessage = response.statusText;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.error || errorBody.message || errorMessage;
        } catch (_b) {
        }
        return Promise.reject(new Error(errorMessage));
      }
      /**
       * Sends a message into the channel.
       *
       * @param args Arguments to send to channel
       * @param args.type The type of event to send
       * @param args.event The name of the event being sent
       * @param args.payload Payload to be sent
       * @param opts Options to be used during the send process
       */
      async send(args, opts = {}) {
        var _a, _b;
        if (!this._canPush() && args.type === "broadcast") {
          console.warn("Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.");
          const { event, payload: endpoint_payload } = args;
          const headers = {
            apikey: this.socket.apiKey ? this.socket.apiKey : "",
            "Content-Type": "application/json"
          };
          if (this.socket.accessTokenValue) {
            headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
          }
          const options = {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [
                {
                  topic: this.subTopic,
                  event,
                  payload: endpoint_payload,
                  private: this.private
                }
              ]
            })
          };
          try {
            const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
            await ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel());
            return response.ok ? "ok" : "error";
          } catch (error) {
            if (error.name === "AbortError") {
              return "timed out";
            } else {
              return "error";
            }
          }
        } else {
          return new Promise((resolve4) => {
            var _a2, _b2, _c;
            const push = this._push(args.type, args, opts.timeout || this.timeout);
            if (args.type === "broadcast" && !((_c = (_b2 = (_a2 = this.params) === null || _a2 === void 0 ? void 0 : _a2.config) === null || _b2 === void 0 ? void 0 : _b2.broadcast) === null || _c === void 0 ? void 0 : _c.ack)) {
              resolve4("ok");
            }
            push.receive("ok", () => resolve4("ok"));
            push.receive("error", () => resolve4("error"));
            push.receive("timeout", () => resolve4("timed out"));
          });
        }
      }
      /**
       * Updates the payload that will be sent the next time the channel joins (reconnects).
       * Useful for rotating access tokens or updating config without re-creating the channel.
       */
      updateJoinPayload(payload) {
        this.joinPush.updatePayload(payload);
      }
      /**
       * Leaves the channel.
       *
       * Unsubscribes from server events, and instructs channel to terminate on server.
       * Triggers onClose() hooks.
       *
       * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
       * channel.unsubscribe().receive("ok", () => alert("left!") )
       */
      unsubscribe(timeout = this.timeout) {
        this.state = constants_1.CHANNEL_STATES.leaving;
        const onClose = () => {
          this.socket.log("channel", `leave ${this.topic}`);
          this._trigger(constants_1.CHANNEL_EVENTS.close, "leave", this._joinRef());
        };
        this.joinPush.destroy();
        let leavePush = null;
        return new Promise((resolve4) => {
          leavePush = new push_1.default(this, constants_1.CHANNEL_EVENTS.leave, {}, timeout);
          leavePush.receive("ok", () => {
            onClose();
            resolve4("ok");
          }).receive("timeout", () => {
            onClose();
            resolve4("timed out");
          }).receive("error", () => {
            resolve4("error");
          });
          leavePush.send();
          if (!this._canPush()) {
            leavePush.trigger("ok", {});
          }
        }).finally(() => {
          leavePush === null || leavePush === void 0 ? void 0 : leavePush.destroy();
        });
      }
      /**
       * Teardown the channel.
       *
       * Destroys and stops related timers.
       */
      teardown() {
        this.pushBuffer.forEach((push) => push.destroy());
        this.pushBuffer = [];
        this.rejoinTimer.reset();
        this.joinPush.destroy();
        this.state = constants_1.CHANNEL_STATES.closed;
        this.bindings = {};
      }
      /** @internal */
      async _fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await this.socket.fetch(url, Object.assign(Object.assign({}, options), { signal: controller.signal }));
        clearTimeout(id);
        return response;
      }
      /** @internal */
      _push(event, payload, timeout = this.timeout) {
        if (!this.joinedOnce) {
          throw `tried to push '${event}' to '${this.topic}' before joining. Use channel.subscribe() before pushing events`;
        }
        let pushEvent = new push_1.default(this, event, payload, timeout);
        if (this._canPush()) {
          pushEvent.send();
        } else {
          this._addToPushBuffer(pushEvent);
        }
        return pushEvent;
      }
      /** @internal */
      _addToPushBuffer(pushEvent) {
        pushEvent.startTimeout();
        this.pushBuffer.push(pushEvent);
        if (this.pushBuffer.length > constants_1.MAX_PUSH_BUFFER_SIZE) {
          const removedPush = this.pushBuffer.shift();
          if (removedPush) {
            removedPush.destroy();
            this.socket.log("channel", `discarded push due to buffer overflow: ${removedPush.event}`, removedPush.payload);
          }
        }
      }
      /**
       * Overridable message hook
       *
       * Receives all events for specialized message handling before dispatching to the channel callbacks.
       * Must return the payload, modified or unmodified.
       *
       * @internal
       */
      _onMessage(_event, payload, _ref) {
        return payload;
      }
      /** @internal */
      _isMember(topic) {
        return this.topic === topic;
      }
      /** @internal */
      _joinRef() {
        return this.joinPush.ref;
      }
      /** @internal */
      _trigger(type, payload, ref) {
        var _a, _b;
        const typeLower = type.toLocaleLowerCase();
        const { close, error, leave, join: join8 } = constants_1.CHANNEL_EVENTS;
        const events = [close, error, leave, join8];
        if (ref && events.indexOf(typeLower) >= 0 && ref !== this._joinRef()) {
          return;
        }
        let handledPayload = this._onMessage(typeLower, payload, ref);
        if (payload && !handledPayload) {
          throw "channel onMessage callbacks must return the payload, modified or unmodified";
        }
        if (["insert", "update", "delete"].includes(typeLower)) {
          (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.filter((bind) => {
            var _a2, _b2, _c;
            return ((_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event) === "*" || ((_c = (_b2 = bind.filter) === null || _b2 === void 0 ? void 0 : _b2.event) === null || _c === void 0 ? void 0 : _c.toLocaleLowerCase()) === typeLower;
          }).map((bind) => bind.callback(handledPayload, ref));
        } else {
          (_b = this.bindings[typeLower]) === null || _b === void 0 ? void 0 : _b.filter((bind) => {
            var _a2, _b2, _c, _d, _e, _f;
            if (["broadcast", "presence", "postgres_changes"].includes(typeLower)) {
              if ("id" in bind) {
                const bindId = bind.id;
                const bindEvent = (_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event;
                return bindId && ((_b2 = payload.ids) === null || _b2 === void 0 ? void 0 : _b2.includes(bindId)) && (bindEvent === "*" || (bindEvent === null || bindEvent === void 0 ? void 0 : bindEvent.toLocaleLowerCase()) === ((_c = payload.data) === null || _c === void 0 ? void 0 : _c.type.toLocaleLowerCase()));
              } else {
                const bindEvent = (_e = (_d = bind === null || bind === void 0 ? void 0 : bind.filter) === null || _d === void 0 ? void 0 : _d.event) === null || _e === void 0 ? void 0 : _e.toLocaleLowerCase();
                return bindEvent === "*" || bindEvent === ((_f = payload === null || payload === void 0 ? void 0 : payload.event) === null || _f === void 0 ? void 0 : _f.toLocaleLowerCase());
              }
            } else {
              return bind.type.toLocaleLowerCase() === typeLower;
            }
          }).map((bind) => {
            if (typeof handledPayload === "object" && "ids" in handledPayload) {
              const postgresChanges = handledPayload.data;
              const { schema, table, commit_timestamp, type: type2, errors } = postgresChanges;
              const enrichedPayload = {
                schema,
                table,
                commit_timestamp,
                eventType: type2,
                new: {},
                old: {},
                errors
              };
              handledPayload = Object.assign(Object.assign({}, enrichedPayload), this._getPayloadRecords(postgresChanges));
            }
            bind.callback(handledPayload, ref);
          });
        }
      }
      /** @internal */
      _isClosed() {
        return this.state === constants_1.CHANNEL_STATES.closed;
      }
      /** @internal */
      _isJoined() {
        return this.state === constants_1.CHANNEL_STATES.joined;
      }
      /** @internal */
      _isJoining() {
        return this.state === constants_1.CHANNEL_STATES.joining;
      }
      /** @internal */
      _isLeaving() {
        return this.state === constants_1.CHANNEL_STATES.leaving;
      }
      /** @internal */
      _replyEventName(ref) {
        return `chan_reply_${ref}`;
      }
      /** @internal */
      _on(type, filter, callback) {
        const typeLower = type.toLocaleLowerCase();
        const binding = {
          type: typeLower,
          filter,
          callback
        };
        if (this.bindings[typeLower]) {
          this.bindings[typeLower].push(binding);
        } else {
          this.bindings[typeLower] = [binding];
        }
        return this;
      }
      /** @internal */
      _off(type, filter) {
        const typeLower = type.toLocaleLowerCase();
        if (this.bindings[typeLower]) {
          this.bindings[typeLower] = this.bindings[typeLower].filter((bind) => {
            var _a;
            return !(((_a = bind.type) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase()) === typeLower && _RealtimeChannel.isEqual(bind.filter, filter));
          });
        }
        return this;
      }
      /** @internal */
      static isEqual(obj1, obj2) {
        if (Object.keys(obj1).length !== Object.keys(obj2).length) {
          return false;
        }
        for (const k in obj1) {
          if (obj1[k] !== obj2[k]) {
            return false;
          }
        }
        return true;
      }
      /**
       * Compares two optional filter values for equality.
       * Treats undefined, null, and empty string as equivalent empty values.
       * @internal
       */
      static isFilterValueEqual(serverValue, clientValue) {
        const normalizedServer = serverValue !== null && serverValue !== void 0 ? serverValue : void 0;
        const normalizedClient = clientValue !== null && clientValue !== void 0 ? clientValue : void 0;
        return normalizedServer === normalizedClient;
      }
      /** @internal */
      _rejoinUntilConnected() {
        this.rejoinTimer.scheduleTimeout();
        if (this.socket.isConnected()) {
          this._rejoin();
        }
      }
      /**
       * Registers a callback that will be executed when the channel closes.
       *
       * @internal
       */
      _onClose(callback) {
        this._on(constants_1.CHANNEL_EVENTS.close, {}, callback);
      }
      /**
       * Registers a callback that will be executed when the channel encounteres an error.
       *
       * @internal
       */
      _onError(callback) {
        this._on(constants_1.CHANNEL_EVENTS.error, {}, (reason) => callback(reason));
      }
      /**
       * Returns `true` if the socket is connected and the channel has been joined.
       *
       * @internal
       */
      _canPush() {
        return this.socket.isConnected() && this._isJoined();
      }
      /** @internal */
      _rejoin(timeout = this.timeout) {
        if (this._isLeaving()) {
          return;
        }
        this.socket._leaveOpenTopic(this.topic);
        this.state = constants_1.CHANNEL_STATES.joining;
        this.joinPush.resend(timeout);
      }
      /** @internal */
      _getPayloadRecords(payload) {
        const records = {
          new: {},
          old: {}
        };
        if (payload.type === "INSERT" || payload.type === "UPDATE") {
          records.new = Transformers.convertChangeData(payload.columns, payload.record);
        }
        if (payload.type === "UPDATE" || payload.type === "DELETE") {
          records.old = Transformers.convertChangeData(payload.columns, payload.old_record);
        }
        return records;
      }
    };
    exports.default = RealtimeChannel;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js
var require_RealtimeClient = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var websocket_factory_1 = tslib_1.__importDefault(require_websocket_factory());
    var constants_1 = require_constants();
    var serializer_1 = tslib_1.__importDefault(require_serializer());
    var timer_1 = tslib_1.__importDefault(require_timer());
    var transformers_1 = require_transformers();
    var RealtimeChannel_1 = tslib_1.__importDefault(require_RealtimeChannel());
    var noop = () => {
    };
    var CONNECTION_TIMEOUTS = {
      HEARTBEAT_INTERVAL: 25e3,
      RECONNECT_DELAY: 10,
      HEARTBEAT_TIMEOUT_FALLBACK: 100
    };
    var RECONNECT_INTERVALS = [1e3, 2e3, 5e3, 1e4];
    var DEFAULT_RECONNECT_FALLBACK = 1e4;
    var WORKER_SCRIPT = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
    var RealtimeClient2 = class {
      /**
       * Initializes the Socket.
       *
       * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
       * @param httpEndpoint The string HTTP endpoint, ie, "https://example.com", "/" (inherited host & protocol)
       * @param options.transport The Websocket Transport, for example WebSocket. This can be a custom implementation
       * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
       * @param options.params The optional params to pass when connecting.
       * @param options.headers Deprecated: headers cannot be set on websocket connections and this option will be removed in the future.
       * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
       * @param options.heartbeatCallback The optional function to handle heartbeat status and latency.
       * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
       * @param options.logLevel Sets the log level for Realtime
       * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
       * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
       * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
       * @param options.worker Use Web Worker to set a side flow. Defaults to false.
       * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
       * @param options.vsn The protocol version to use when connecting. Supported versions are "1.0.0" and "2.0.0". Defaults to "2.0.0".
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * client.connect()
       * ```
       */
      constructor(endPoint, options) {
        var _a;
        this.accessTokenValue = null;
        this.apiKey = null;
        this._manuallySetToken = false;
        this.channels = new Array();
        this.endPoint = "";
        this.httpEndpoint = "";
        this.headers = {};
        this.params = {};
        this.timeout = constants_1.DEFAULT_TIMEOUT;
        this.transport = null;
        this.heartbeatIntervalMs = CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.heartbeatTimer = void 0;
        this.pendingHeartbeatRef = null;
        this.heartbeatCallback = noop;
        this.ref = 0;
        this.reconnectTimer = null;
        this.vsn = constants_1.DEFAULT_VSN;
        this.logger = noop;
        this.conn = null;
        this.sendBuffer = [];
        this.serializer = new serializer_1.default();
        this.stateChangeCallbacks = {
          open: [],
          close: [],
          error: [],
          message: []
        };
        this.accessToken = null;
        this._connectionState = "disconnected";
        this._wasManualDisconnect = false;
        this._authPromise = null;
        this._heartbeatSentAt = null;
        this._resolveFetch = (customFetch) => {
          if (customFetch) {
            return (...args) => customFetch(...args);
          }
          return (...args) => fetch(...args);
        };
        if (!((_a = options === null || options === void 0 ? void 0 : options.params) === null || _a === void 0 ? void 0 : _a.apikey)) {
          throw new Error("API key is required to connect to Realtime");
        }
        this.apiKey = options.params.apikey;
        this.endPoint = `${endPoint}/${constants_1.TRANSPORTS.websocket}`;
        this.httpEndpoint = (0, transformers_1.httpEndpointURL)(endPoint);
        this._initializeOptions(options);
        this._setupReconnectionTimer();
        this.fetch = this._resolveFetch(options === null || options === void 0 ? void 0 : options.fetch);
      }
      /**
       * Connects the socket, unless already connected.
       */
      connect() {
        if (this.isConnecting() || this.isDisconnecting() || this.conn !== null && this.isConnected()) {
          return;
        }
        this._setConnectionState("connecting");
        if (this.accessToken && !this._authPromise) {
          this._setAuthSafely("connect");
        }
        if (this.transport) {
          this.conn = new this.transport(this.endpointURL());
        } else {
          try {
            this.conn = websocket_factory_1.default.createWebSocket(this.endpointURL());
          } catch (error) {
            this._setConnectionState("disconnected");
            const errorMessage = error.message;
            if (errorMessage.includes("Node.js")) {
              throw new Error(`${errorMessage}

To use Realtime in Node.js, you need to provide a WebSocket implementation:

Option 1: Use Node.js 22+ which has native WebSocket support
Option 2: Install and provide the "ws" package:

  npm install ws

  import ws from "ws"
  const client = new RealtimeClient(url, {
    ...options,
    transport: ws
  })`);
            }
            throw new Error(`WebSocket not available: ${errorMessage}`);
          }
        }
        this._setupConnectionHandlers();
      }
      /**
       * Returns the URL of the websocket.
       * @returns string The URL of the websocket.
       */
      endpointURL() {
        return this._appendParams(this.endPoint, Object.assign({}, this.params, { vsn: this.vsn }));
      }
      /**
       * Disconnects the socket.
       *
       * @param code A numeric status code to send on disconnect.
       * @param reason A custom reason for the disconnect.
       */
      disconnect(code, reason) {
        if (this.isDisconnecting()) {
          return;
        }
        this._setConnectionState("disconnecting", true);
        if (this.conn) {
          const fallbackTimer = setTimeout(() => {
            this._setConnectionState("disconnected");
          }, 100);
          this.conn.onclose = () => {
            clearTimeout(fallbackTimer);
            this._setConnectionState("disconnected");
          };
          if (typeof this.conn.close === "function") {
            if (code) {
              this.conn.close(code, reason !== null && reason !== void 0 ? reason : "");
            } else {
              this.conn.close();
            }
          }
          this._teardownConnection();
        } else {
          this._setConnectionState("disconnected");
        }
      }
      /**
       * Returns all created channels
       */
      getChannels() {
        return this.channels;
      }
      /**
       * Unsubscribes and removes a single channel
       * @param channel A RealtimeChannel instance
       */
      async removeChannel(channel) {
        const status = await channel.unsubscribe();
        if (this.channels.length === 0) {
          this.disconnect();
        }
        return status;
      }
      /**
       * Unsubscribes and removes all channels
       */
      async removeAllChannels() {
        const values_1 = await Promise.all(this.channels.map((channel) => channel.unsubscribe()));
        this.channels = [];
        this.disconnect();
        return values_1;
      }
      /**
       * Logs the message.
       *
       * For customized logging, `this.logger` can be overridden.
       */
      log(kind, msg, data) {
        this.logger(kind, msg, data);
      }
      /**
       * Returns the current state of the socket.
       */
      connectionState() {
        switch (this.conn && this.conn.readyState) {
          case constants_1.SOCKET_STATES.connecting:
            return constants_1.CONNECTION_STATE.Connecting;
          case constants_1.SOCKET_STATES.open:
            return constants_1.CONNECTION_STATE.Open;
          case constants_1.SOCKET_STATES.closing:
            return constants_1.CONNECTION_STATE.Closing;
          default:
            return constants_1.CONNECTION_STATE.Closed;
        }
      }
      /**
       * Returns `true` is the connection is open.
       */
      isConnected() {
        return this.connectionState() === constants_1.CONNECTION_STATE.Open;
      }
      /**
       * Returns `true` if the connection is currently connecting.
       */
      isConnecting() {
        return this._connectionState === "connecting";
      }
      /**
       * Returns `true` if the connection is currently disconnecting.
       */
      isDisconnecting() {
        return this._connectionState === "disconnecting";
      }
      /**
       * Creates (or reuses) a {@link RealtimeChannel} for the provided topic.
       *
       * Topics are automatically prefixed with `realtime:` to match the Realtime service.
       * If a channel with the same topic already exists it will be returned instead of creating
       * a duplicate connection.
       */
      channel(topic, params = { config: {} }) {
        const realtimeTopic = `realtime:${topic}`;
        const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
        if (!exists) {
          const chan = new RealtimeChannel_1.default(`realtime:${topic}`, params, this);
          this.channels.push(chan);
          return chan;
        } else {
          return exists;
        }
      }
      /**
       * Push out a message if the socket is connected.
       *
       * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
       */
      push(data) {
        const { topic, event, payload, ref } = data;
        const callback = () => {
          this.encode(data, (result) => {
            var _a;
            (_a = this.conn) === null || _a === void 0 ? void 0 : _a.send(result);
          });
        };
        this.log("push", `${topic} ${event} (${ref})`, payload);
        if (this.isConnected()) {
          callback();
        } else {
          this.sendBuffer.push(callback);
        }
      }
      /**
       * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
       *
       * If param is null it will use the `accessToken` callback function or the token set on the client.
       *
       * On callback used, it will set the value of the token internal to the client.
       *
       * When a token is explicitly provided, it will be preserved across channel operations
       * (including removeChannel and resubscribe). The `accessToken` callback will not be
       * invoked until `setAuth()` is called without arguments.
       *
       * @param token A JWT string to override the token set on the client.
       *
       * @example
       * // Use a manual token (preserved across resubscribes, ignores accessToken callback)
       * client.realtime.setAuth('my-custom-jwt')
       *
       * // Switch back to using the accessToken callback
       * client.realtime.setAuth()
       */
      async setAuth(token = null) {
        this._authPromise = this._performAuth(token);
        try {
          await this._authPromise;
        } finally {
          this._authPromise = null;
        }
      }
      /**
       * Returns true if the current access token was explicitly set via setAuth(token),
       * false if it was obtained via the accessToken callback.
       * @internal
       */
      _isManualToken() {
        return this._manuallySetToken;
      }
      /**
       * Sends a heartbeat message if the socket is connected.
       */
      async sendHeartbeat() {
        var _a;
        if (!this.isConnected()) {
          try {
            this.heartbeatCallback("disconnected");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          return;
        }
        if (this.pendingHeartbeatRef) {
          this.pendingHeartbeatRef = null;
          this._heartbeatSentAt = null;
          this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
          try {
            this.heartbeatCallback("timeout");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          this._wasManualDisconnect = false;
          (_a = this.conn) === null || _a === void 0 ? void 0 : _a.close(constants_1.WS_CLOSE_NORMAL, "heartbeat timeout");
          setTimeout(() => {
            var _a2;
            if (!this.isConnected()) {
              (_a2 = this.reconnectTimer) === null || _a2 === void 0 ? void 0 : _a2.scheduleTimeout();
            }
          }, CONNECTION_TIMEOUTS.HEARTBEAT_TIMEOUT_FALLBACK);
          return;
        }
        this._heartbeatSentAt = Date.now();
        this.pendingHeartbeatRef = this._makeRef();
        this.push({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: this.pendingHeartbeatRef
        });
        try {
          this.heartbeatCallback("sent");
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
        this._setAuthSafely("heartbeat");
      }
      /**
       * Sets a callback that receives lifecycle events for internal heartbeat messages.
       * Useful for instrumenting connection health (e.g. sent/ok/timeout/disconnected).
       */
      onHeartbeat(callback) {
        this.heartbeatCallback = callback;
      }
      /**
       * Flushes send buffer
       */
      flushSendBuffer() {
        if (this.isConnected() && this.sendBuffer.length > 0) {
          this.sendBuffer.forEach((callback) => callback());
          this.sendBuffer = [];
        }
      }
      /**
       * Return the next message ref, accounting for overflows
       *
       * @internal
       */
      _makeRef() {
        let newRef = this.ref + 1;
        if (newRef === this.ref) {
          this.ref = 0;
        } else {
          this.ref = newRef;
        }
        return this.ref.toString();
      }
      /**
       * Unsubscribe from channels with the specified topic.
       *
       * @internal
       */
      _leaveOpenTopic(topic) {
        let dupChannel = this.channels.find((c) => c.topic === topic && (c._isJoined() || c._isJoining()));
        if (dupChannel) {
          this.log("transport", `leaving duplicate topic "${topic}"`);
          dupChannel.unsubscribe();
        }
      }
      /**
       * Removes a subscription from the socket.
       *
       * @param channel An open subscription.
       *
       * @internal
       */
      _remove(channel) {
        this.channels = this.channels.filter((c) => c.topic !== channel.topic);
      }
      /** @internal */
      _onConnMessage(rawMessage) {
        this.decode(rawMessage.data, (msg) => {
          if (msg.topic === "phoenix" && msg.event === "phx_reply" && msg.ref && msg.ref === this.pendingHeartbeatRef) {
            const latency = this._heartbeatSentAt ? Date.now() - this._heartbeatSentAt : void 0;
            try {
              this.heartbeatCallback(msg.payload.status === "ok" ? "ok" : "error", latency);
            } catch (e) {
              this.log("error", "error in heartbeat callback", e);
            }
            this._heartbeatSentAt = null;
            this.pendingHeartbeatRef = null;
          }
          const { topic, event, payload, ref } = msg;
          const refString = ref ? `(${ref})` : "";
          const status = payload.status || "";
          this.log("receive", `${status} ${topic} ${event} ${refString}`.trim(), payload);
          this.channels.filter((channel) => channel._isMember(topic)).forEach((channel) => channel._trigger(event, payload, ref));
          this._triggerStateCallbacks("message", msg);
        });
      }
      /**
       * Clear specific timer
       * @internal
       */
      _clearTimer(timer) {
        var _a;
        if (timer === "heartbeat" && this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = void 0;
        } else if (timer === "reconnect") {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.reset();
        }
      }
      /**
       * Clear all timers
       * @internal
       */
      _clearAllTimers() {
        this._clearTimer("heartbeat");
        this._clearTimer("reconnect");
      }
      /**
       * Setup connection handlers for WebSocket events
       * @internal
       */
      _setupConnectionHandlers() {
        if (!this.conn)
          return;
        if ("binaryType" in this.conn) {
          ;
          this.conn.binaryType = "arraybuffer";
        }
        this.conn.onopen = () => this._onConnOpen();
        this.conn.onerror = (error) => this._onConnError(error);
        this.conn.onmessage = (event) => this._onConnMessage(event);
        this.conn.onclose = (event) => this._onConnClose(event);
        if (this.conn.readyState === constants_1.SOCKET_STATES.open) {
          this._onConnOpen();
        }
      }
      /**
       * Teardown connection and cleanup resources
       * @internal
       */
      _teardownConnection() {
        if (this.conn) {
          if (this.conn.readyState === constants_1.SOCKET_STATES.open || this.conn.readyState === constants_1.SOCKET_STATES.connecting) {
            try {
              this.conn.close();
            } catch (e) {
              this.log("error", "Error closing connection", e);
            }
          }
          this.conn.onopen = null;
          this.conn.onerror = null;
          this.conn.onmessage = null;
          this.conn.onclose = null;
          this.conn = null;
        }
        this._clearAllTimers();
        this._terminateWorker();
        this.channels.forEach((channel) => channel.teardown());
      }
      /** @internal */
      _onConnOpen() {
        this._setConnectionState("connected");
        this.log("transport", `connected to ${this.endpointURL()}`);
        const authPromise = this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve());
        authPromise.then(() => {
          if (this.accessTokenValue) {
            this.channels.forEach((channel) => {
              channel.updateJoinPayload({ access_token: this.accessTokenValue });
            });
            this.sendBuffer = [];
            this.channels.forEach((channel) => {
              if (channel._isJoining()) {
                channel.joinPush.sent = false;
                channel.joinPush.send();
              }
            });
          }
          this.flushSendBuffer();
        }).catch((e) => {
          this.log("error", "error waiting for auth on connect", e);
          this.flushSendBuffer();
        });
        this._clearTimer("reconnect");
        if (!this.worker) {
          this._startHeartbeat();
        } else {
          if (!this.workerRef) {
            this._startWorkerHeartbeat();
          }
        }
        this._triggerStateCallbacks("open");
      }
      /** @internal */
      _startHeartbeat() {
        this.heartbeatTimer && clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
      }
      /** @internal */
      _startWorkerHeartbeat() {
        if (this.workerUrl) {
          this.log("worker", `starting worker for from ${this.workerUrl}`);
        } else {
          this.log("worker", `starting default worker`);
        }
        const objectUrl = this._workerObjectUrl(this.workerUrl);
        this.workerRef = new Worker(objectUrl);
        this.workerRef.onerror = (error) => {
          this.log("worker", "worker error", error.message);
          this._terminateWorker();
        };
        this.workerRef.onmessage = (event) => {
          if (event.data.event === "keepAlive") {
            this.sendHeartbeat();
          }
        };
        this.workerRef.postMessage({
          event: "start",
          interval: this.heartbeatIntervalMs
        });
      }
      /**
       * Terminate the Web Worker and clear the reference
       * @internal
       */
      _terminateWorker() {
        if (this.workerRef) {
          this.log("worker", "terminating worker");
          this.workerRef.terminate();
          this.workerRef = void 0;
        }
      }
      /** @internal */
      _onConnClose(event) {
        var _a;
        this._setConnectionState("disconnected");
        this.log("transport", "close", event);
        this._triggerChanError();
        this._clearTimer("heartbeat");
        if (!this._wasManualDisconnect) {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.scheduleTimeout();
        }
        this._triggerStateCallbacks("close", event);
      }
      /** @internal */
      _onConnError(error) {
        this._setConnectionState("disconnected");
        this.log("transport", `${error}`);
        this._triggerChanError();
        this._triggerStateCallbacks("error", error);
        try {
          this.heartbeatCallback("error");
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
      }
      /** @internal */
      _triggerChanError() {
        this.channels.forEach((channel) => channel._trigger(constants_1.CHANNEL_EVENTS.error));
      }
      /** @internal */
      _appendParams(url, params) {
        if (Object.keys(params).length === 0) {
          return url;
        }
        const prefix = url.match(/\?/) ? "&" : "?";
        const query = new URLSearchParams(params);
        return `${url}${prefix}${query}`;
      }
      _workerObjectUrl(url) {
        let result_url;
        if (url) {
          result_url = url;
        } else {
          const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
          result_url = URL.createObjectURL(blob);
        }
        return result_url;
      }
      /**
       * Set connection state with proper state management
       * @internal
       */
      _setConnectionState(state, manual = false) {
        this._connectionState = state;
        if (state === "connecting") {
          this._wasManualDisconnect = false;
        } else if (state === "disconnecting") {
          this._wasManualDisconnect = manual;
        }
      }
      /**
       * Perform the actual auth operation
       * @internal
       */
      async _performAuth(token = null) {
        let tokenToSend;
        let isManualToken = false;
        if (token) {
          tokenToSend = token;
          isManualToken = true;
        } else if (this.accessToken) {
          try {
            tokenToSend = await this.accessToken();
          } catch (e) {
            this.log("error", "Error fetching access token from callback", e);
            tokenToSend = this.accessTokenValue;
          }
        } else {
          tokenToSend = this.accessTokenValue;
        }
        if (isManualToken) {
          this._manuallySetToken = true;
        } else if (this.accessToken) {
          this._manuallySetToken = false;
        }
        if (this.accessTokenValue != tokenToSend) {
          this.accessTokenValue = tokenToSend;
          this.channels.forEach((channel) => {
            const payload = {
              access_token: tokenToSend,
              version: constants_1.DEFAULT_VERSION
            };
            tokenToSend && channel.updateJoinPayload(payload);
            if (channel.joinedOnce && channel._isJoined()) {
              channel._push(constants_1.CHANNEL_EVENTS.access_token, {
                access_token: tokenToSend
              });
            }
          });
        }
      }
      /**
       * Wait for any in-flight auth operations to complete
       * @internal
       */
      async _waitForAuthIfNeeded() {
        if (this._authPromise) {
          await this._authPromise;
        }
      }
      /**
       * Safely call setAuth with standardized error handling
       * @internal
       */
      _setAuthSafely(context = "general") {
        if (!this._isManualToken()) {
          this.setAuth().catch((e) => {
            this.log("error", `Error setting auth in ${context}`, e);
          });
        }
      }
      /**
       * Trigger state change callbacks with proper error handling
       * @internal
       */
      _triggerStateCallbacks(event, data) {
        try {
          this.stateChangeCallbacks[event].forEach((callback) => {
            try {
              callback(data);
            } catch (e) {
              this.log("error", `error in ${event} callback`, e);
            }
          });
        } catch (e) {
          this.log("error", `error triggering ${event} callbacks`, e);
        }
      }
      /**
       * Setup reconnection timer with proper configuration
       * @internal
       */
      _setupReconnectionTimer() {
        this.reconnectTimer = new timer_1.default(async () => {
          setTimeout(async () => {
            await this._waitForAuthIfNeeded();
            if (!this.isConnected()) {
              this.connect();
            }
          }, CONNECTION_TIMEOUTS.RECONNECT_DELAY);
        }, this.reconnectAfterMs);
      }
      /**
       * Initialize client options with defaults
       * @internal
       */
      _initializeOptions(options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        this.transport = (_a = options === null || options === void 0 ? void 0 : options.transport) !== null && _a !== void 0 ? _a : null;
        this.timeout = (_b = options === null || options === void 0 ? void 0 : options.timeout) !== null && _b !== void 0 ? _b : constants_1.DEFAULT_TIMEOUT;
        this.heartbeatIntervalMs = (_c = options === null || options === void 0 ? void 0 : options.heartbeatIntervalMs) !== null && _c !== void 0 ? _c : CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.worker = (_d = options === null || options === void 0 ? void 0 : options.worker) !== null && _d !== void 0 ? _d : false;
        this.accessToken = (_e = options === null || options === void 0 ? void 0 : options.accessToken) !== null && _e !== void 0 ? _e : null;
        this.heartbeatCallback = (_f = options === null || options === void 0 ? void 0 : options.heartbeatCallback) !== null && _f !== void 0 ? _f : noop;
        this.vsn = (_g = options === null || options === void 0 ? void 0 : options.vsn) !== null && _g !== void 0 ? _g : constants_1.DEFAULT_VSN;
        if (options === null || options === void 0 ? void 0 : options.params)
          this.params = options.params;
        if (options === null || options === void 0 ? void 0 : options.logger)
          this.logger = options.logger;
        if ((options === null || options === void 0 ? void 0 : options.logLevel) || (options === null || options === void 0 ? void 0 : options.log_level)) {
          this.logLevel = options.logLevel || options.log_level;
          this.params = Object.assign(Object.assign({}, this.params), { log_level: this.logLevel });
        }
        this.reconnectAfterMs = (_h = options === null || options === void 0 ? void 0 : options.reconnectAfterMs) !== null && _h !== void 0 ? _h : (tries) => {
          return RECONNECT_INTERVALS[tries - 1] || DEFAULT_RECONNECT_FALLBACK;
        };
        switch (this.vsn) {
          case constants_1.VSN_1_0_0:
            this.encode = (_j = options === null || options === void 0 ? void 0 : options.encode) !== null && _j !== void 0 ? _j : (payload, callback) => {
              return callback(JSON.stringify(payload));
            };
            this.decode = (_k = options === null || options === void 0 ? void 0 : options.decode) !== null && _k !== void 0 ? _k : (payload, callback) => {
              return callback(JSON.parse(payload));
            };
            break;
          case constants_1.VSN_2_0_0:
            this.encode = (_l = options === null || options === void 0 ? void 0 : options.encode) !== null && _l !== void 0 ? _l : this.serializer.encode.bind(this.serializer);
            this.decode = (_m = options === null || options === void 0 ? void 0 : options.decode) !== null && _m !== void 0 ? _m : this.serializer.decode.bind(this.serializer);
            break;
          default:
            throw new Error(`Unsupported serializer version: ${this.vsn}`);
        }
        if (this.worker) {
          if (typeof window !== "undefined" && !window.Worker) {
            throw new Error("Web Worker is not supported");
          }
          this.workerUrl = options === null || options === void 0 ? void 0 : options.workerUrl;
        }
      }
    };
    exports.default = RealtimeClient2;
  }
});

// ../../node_modules/@supabase/realtime-js/dist/main/index.js
var require_main2 = __commonJS({
  "../../node_modules/@supabase/realtime-js/dist/main/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebSocketFactory = exports.REALTIME_CHANNEL_STATES = exports.REALTIME_SUBSCRIBE_STATES = exports.REALTIME_PRESENCE_LISTEN_EVENTS = exports.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = exports.REALTIME_LISTEN_TYPES = exports.RealtimeClient = exports.RealtimeChannel = exports.RealtimePresence = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var RealtimeClient_1 = tslib_1.__importDefault(require_RealtimeClient());
    exports.RealtimeClient = RealtimeClient_1.default;
    var RealtimeChannel_1 = tslib_1.__importStar(require_RealtimeChannel());
    exports.RealtimeChannel = RealtimeChannel_1.default;
    Object.defineProperty(exports, "REALTIME_LISTEN_TYPES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_LISTEN_TYPES;
    } });
    Object.defineProperty(exports, "REALTIME_POSTGRES_CHANGES_LISTEN_EVENT", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
    } });
    Object.defineProperty(exports, "REALTIME_SUBSCRIBE_STATES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_SUBSCRIBE_STATES;
    } });
    Object.defineProperty(exports, "REALTIME_CHANNEL_STATES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_CHANNEL_STATES;
    } });
    var RealtimePresence_1 = tslib_1.__importStar(require_RealtimePresence());
    exports.RealtimePresence = RealtimePresence_1.default;
    Object.defineProperty(exports, "REALTIME_PRESENCE_LISTEN_EVENTS", { enumerable: true, get: function() {
      return RealtimePresence_1.REALTIME_PRESENCE_LISTEN_EVENTS;
    } });
    var websocket_factory_1 = tslib_1.__importDefault(require_websocket_factory());
    exports.WebSocketFactory = websocket_factory_1.default;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/version.js
var require_version2 = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "2.98.0";
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/constants.js
var require_constants2 = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.JWKS_TTL = exports.BASE64URL_REGEX = exports.API_VERSIONS = exports.API_VERSION_HEADER_NAME = exports.NETWORK_FAILURE = exports.DEFAULT_HEADERS = exports.AUDIENCE = exports.STORAGE_KEY = exports.GOTRUE_URL = exports.EXPIRY_MARGIN_MS = exports.AUTO_REFRESH_TICK_THRESHOLD = exports.AUTO_REFRESH_TICK_DURATION_MS = void 0;
    var version_1 = require_version2();
    exports.AUTO_REFRESH_TICK_DURATION_MS = 30 * 1e3;
    exports.AUTO_REFRESH_TICK_THRESHOLD = 3;
    exports.EXPIRY_MARGIN_MS = exports.AUTO_REFRESH_TICK_THRESHOLD * exports.AUTO_REFRESH_TICK_DURATION_MS;
    exports.GOTRUE_URL = "http://localhost:9999";
    exports.STORAGE_KEY = "supabase.auth.token";
    exports.AUDIENCE = "";
    exports.DEFAULT_HEADERS = { "X-Client-Info": `gotrue-js/${version_1.version}` };
    exports.NETWORK_FAILURE = {
      MAX_RETRIES: 10,
      RETRY_INTERVAL: 2
      // in deciseconds
    };
    exports.API_VERSION_HEADER_NAME = "X-Supabase-Api-Version";
    exports.API_VERSIONS = {
      "2024-01-01": {
        timestamp: Date.parse("2024-01-01T00:00:00.0Z"),
        name: "2024-01-01"
      }
    };
    exports.BASE64URL_REGEX = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i;
    exports.JWKS_TTL = 10 * 60 * 1e3;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/errors.js
var require_errors = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AuthInvalidJwtError = exports.AuthWeakPasswordError = exports.AuthRetryableFetchError = exports.AuthPKCECodeVerifierMissingError = exports.AuthPKCEGrantCodeExchangeError = exports.AuthImplicitGrantRedirectError = exports.AuthInvalidCredentialsError = exports.AuthInvalidTokenResponseError = exports.AuthSessionMissingError = exports.CustomAuthError = exports.AuthUnknownError = exports.AuthApiError = exports.AuthError = void 0;
    exports.isAuthError = isAuthError;
    exports.isAuthApiError = isAuthApiError;
    exports.isAuthSessionMissingError = isAuthSessionMissingError;
    exports.isAuthImplicitGrantRedirectError = isAuthImplicitGrantRedirectError;
    exports.isAuthPKCECodeVerifierMissingError = isAuthPKCECodeVerifierMissingError;
    exports.isAuthRetryableFetchError = isAuthRetryableFetchError;
    exports.isAuthWeakPasswordError = isAuthWeakPasswordError;
    var AuthError = class extends Error {
      constructor(message, status, code) {
        super(message);
        this.__isAuthError = true;
        this.name = "AuthError";
        this.status = status;
        this.code = code;
      }
    };
    exports.AuthError = AuthError;
    function isAuthError(error) {
      return typeof error === "object" && error !== null && "__isAuthError" in error;
    }
    var AuthApiError = class extends AuthError {
      constructor(message, status, code) {
        super(message, status, code);
        this.name = "AuthApiError";
        this.status = status;
        this.code = code;
      }
    };
    exports.AuthApiError = AuthApiError;
    function isAuthApiError(error) {
      return isAuthError(error) && error.name === "AuthApiError";
    }
    var AuthUnknownError = class extends AuthError {
      constructor(message, originalError) {
        super(message);
        this.name = "AuthUnknownError";
        this.originalError = originalError;
      }
    };
    exports.AuthUnknownError = AuthUnknownError;
    var CustomAuthError = class extends AuthError {
      constructor(message, name, status, code) {
        super(message, status, code);
        this.name = name;
        this.status = status;
      }
    };
    exports.CustomAuthError = CustomAuthError;
    var AuthSessionMissingError = class extends CustomAuthError {
      constructor() {
        super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
      }
    };
    exports.AuthSessionMissingError = AuthSessionMissingError;
    function isAuthSessionMissingError(error) {
      return isAuthError(error) && error.name === "AuthSessionMissingError";
    }
    var AuthInvalidTokenResponseError = class extends CustomAuthError {
      constructor() {
        super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
      }
    };
    exports.AuthInvalidTokenResponseError = AuthInvalidTokenResponseError;
    var AuthInvalidCredentialsError = class extends CustomAuthError {
      constructor(message) {
        super(message, "AuthInvalidCredentialsError", 400, void 0);
      }
    };
    exports.AuthInvalidCredentialsError = AuthInvalidCredentialsError;
    var AuthImplicitGrantRedirectError = class extends CustomAuthError {
      constructor(message, details = null) {
        super(message, "AuthImplicitGrantRedirectError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    exports.AuthImplicitGrantRedirectError = AuthImplicitGrantRedirectError;
    function isAuthImplicitGrantRedirectError(error) {
      return isAuthError(error) && error.name === "AuthImplicitGrantRedirectError";
    }
    var AuthPKCEGrantCodeExchangeError = class extends CustomAuthError {
      constructor(message, details = null) {
        super(message, "AuthPKCEGrantCodeExchangeError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    exports.AuthPKCEGrantCodeExchangeError = AuthPKCEGrantCodeExchangeError;
    var AuthPKCECodeVerifierMissingError = class extends CustomAuthError {
      constructor() {
        super("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.", "AuthPKCECodeVerifierMissingError", 400, "pkce_code_verifier_not_found");
      }
    };
    exports.AuthPKCECodeVerifierMissingError = AuthPKCECodeVerifierMissingError;
    function isAuthPKCECodeVerifierMissingError(error) {
      return isAuthError(error) && error.name === "AuthPKCECodeVerifierMissingError";
    }
    var AuthRetryableFetchError = class extends CustomAuthError {
      constructor(message, status) {
        super(message, "AuthRetryableFetchError", status, void 0);
      }
    };
    exports.AuthRetryableFetchError = AuthRetryableFetchError;
    function isAuthRetryableFetchError(error) {
      return isAuthError(error) && error.name === "AuthRetryableFetchError";
    }
    var AuthWeakPasswordError = class extends CustomAuthError {
      constructor(message, status, reasons) {
        super(message, "AuthWeakPasswordError", status, "weak_password");
        this.reasons = reasons;
      }
    };
    exports.AuthWeakPasswordError = AuthWeakPasswordError;
    function isAuthWeakPasswordError(error) {
      return isAuthError(error) && error.name === "AuthWeakPasswordError";
    }
    var AuthInvalidJwtError = class extends CustomAuthError {
      constructor(message) {
        super(message, "AuthInvalidJwtError", 400, "invalid_jwt");
      }
    };
    exports.AuthInvalidJwtError = AuthInvalidJwtError;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/base64url.js
var require_base64url = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/base64url.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.byteToBase64URL = byteToBase64URL;
    exports.byteFromBase64URL = byteFromBase64URL;
    exports.stringToBase64URL = stringToBase64URL;
    exports.stringFromBase64URL = stringFromBase64URL;
    exports.codepointToUTF8 = codepointToUTF8;
    exports.stringToUTF8 = stringToUTF8;
    exports.stringFromUTF8 = stringFromUTF8;
    exports.base64UrlToUint8Array = base64UrlToUint8Array;
    exports.stringToUint8Array = stringToUint8Array;
    exports.bytesToBase64URL = bytesToBase64URL;
    var TO_BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
    var IGNORE_BASE64URL = " 	\n\r=".split("");
    var FROM_BASE64URL = (() => {
      const charMap = new Array(128);
      for (let i = 0; i < charMap.length; i += 1) {
        charMap[i] = -1;
      }
      for (let i = 0; i < IGNORE_BASE64URL.length; i += 1) {
        charMap[IGNORE_BASE64URL[i].charCodeAt(0)] = -2;
      }
      for (let i = 0; i < TO_BASE64URL.length; i += 1) {
        charMap[TO_BASE64URL[i].charCodeAt(0)] = i;
      }
      return charMap;
    })();
    function byteToBase64URL(byte, state, emit) {
      if (byte !== null) {
        state.queue = state.queue << 8 | byte;
        state.queuedBits += 8;
        while (state.queuedBits >= 6) {
          const pos = state.queue >> state.queuedBits - 6 & 63;
          emit(TO_BASE64URL[pos]);
          state.queuedBits -= 6;
        }
      } else if (state.queuedBits > 0) {
        state.queue = state.queue << 6 - state.queuedBits;
        state.queuedBits = 6;
        while (state.queuedBits >= 6) {
          const pos = state.queue >> state.queuedBits - 6 & 63;
          emit(TO_BASE64URL[pos]);
          state.queuedBits -= 6;
        }
      }
    }
    function byteFromBase64URL(charCode, state, emit) {
      const bits = FROM_BASE64URL[charCode];
      if (bits > -1) {
        state.queue = state.queue << 6 | bits;
        state.queuedBits += 6;
        while (state.queuedBits >= 8) {
          emit(state.queue >> state.queuedBits - 8 & 255);
          state.queuedBits -= 8;
        }
      } else if (bits === -2) {
        return;
      } else {
        throw new Error(`Invalid Base64-URL character "${String.fromCharCode(charCode)}"`);
      }
    }
    function stringToBase64URL(str) {
      const base64 = [];
      const emitter = (char) => {
        base64.push(char);
      };
      const state = { queue: 0, queuedBits: 0 };
      stringToUTF8(str, (byte) => {
        byteToBase64URL(byte, state, emitter);
      });
      byteToBase64URL(null, state, emitter);
      return base64.join("");
    }
    function stringFromBase64URL(str) {
      const conv = [];
      const utf8Emit = (codepoint) => {
        conv.push(String.fromCodePoint(codepoint));
      };
      const utf8State = {
        utf8seq: 0,
        codepoint: 0
      };
      const b64State = { queue: 0, queuedBits: 0 };
      const byteEmit = (byte) => {
        stringFromUTF8(byte, utf8State, utf8Emit);
      };
      for (let i = 0; i < str.length; i += 1) {
        byteFromBase64URL(str.charCodeAt(i), b64State, byteEmit);
      }
      return conv.join("");
    }
    function codepointToUTF8(codepoint, emit) {
      if (codepoint <= 127) {
        emit(codepoint);
        return;
      } else if (codepoint <= 2047) {
        emit(192 | codepoint >> 6);
        emit(128 | codepoint & 63);
        return;
      } else if (codepoint <= 65535) {
        emit(224 | codepoint >> 12);
        emit(128 | codepoint >> 6 & 63);
        emit(128 | codepoint & 63);
        return;
      } else if (codepoint <= 1114111) {
        emit(240 | codepoint >> 18);
        emit(128 | codepoint >> 12 & 63);
        emit(128 | codepoint >> 6 & 63);
        emit(128 | codepoint & 63);
        return;
      }
      throw new Error(`Unrecognized Unicode codepoint: ${codepoint.toString(16)}`);
    }
    function stringToUTF8(str, emit) {
      for (let i = 0; i < str.length; i += 1) {
        let codepoint = str.charCodeAt(i);
        if (codepoint > 55295 && codepoint <= 56319) {
          const highSurrogate = (codepoint - 55296) * 1024 & 65535;
          const lowSurrogate = str.charCodeAt(i + 1) - 56320 & 65535;
          codepoint = (lowSurrogate | highSurrogate) + 65536;
          i += 1;
        }
        codepointToUTF8(codepoint, emit);
      }
    }
    function stringFromUTF8(byte, state, emit) {
      if (state.utf8seq === 0) {
        if (byte <= 127) {
          emit(byte);
          return;
        }
        for (let leadingBit = 1; leadingBit < 6; leadingBit += 1) {
          if ((byte >> 7 - leadingBit & 1) === 0) {
            state.utf8seq = leadingBit;
            break;
          }
        }
        if (state.utf8seq === 2) {
          state.codepoint = byte & 31;
        } else if (state.utf8seq === 3) {
          state.codepoint = byte & 15;
        } else if (state.utf8seq === 4) {
          state.codepoint = byte & 7;
        } else {
          throw new Error("Invalid UTF-8 sequence");
        }
        state.utf8seq -= 1;
      } else if (state.utf8seq > 0) {
        if (byte <= 127) {
          throw new Error("Invalid UTF-8 sequence");
        }
        state.codepoint = state.codepoint << 6 | byte & 63;
        state.utf8seq -= 1;
        if (state.utf8seq === 0) {
          emit(state.codepoint);
        }
      }
    }
    function base64UrlToUint8Array(str) {
      const result = [];
      const state = { queue: 0, queuedBits: 0 };
      const onByte = (byte) => {
        result.push(byte);
      };
      for (let i = 0; i < str.length; i += 1) {
        byteFromBase64URL(str.charCodeAt(i), state, onByte);
      }
      return new Uint8Array(result);
    }
    function stringToUint8Array(str) {
      const result = [];
      stringToUTF8(str, (byte) => result.push(byte));
      return new Uint8Array(result);
    }
    function bytesToBase64URL(bytes) {
      const result = [];
      const state = { queue: 0, queuedBits: 0 };
      const onChar = (char) => {
        result.push(char);
      };
      bytes.forEach((byte) => byteToBase64URL(byte, state, onChar));
      byteToBase64URL(null, state, onChar);
      return result.join("");
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/helpers.js
var require_helpers = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Deferred = exports.removeItemAsync = exports.getItemAsync = exports.setItemAsync = exports.looksLikeFetchResponse = exports.resolveFetch = exports.supportsLocalStorage = exports.isBrowser = void 0;
    exports.expiresAt = expiresAt;
    exports.generateCallbackId = generateCallbackId;
    exports.parseParametersFromURL = parseParametersFromURL;
    exports.decodeJWT = decodeJWT;
    exports.sleep = sleep3;
    exports.retryable = retryable;
    exports.generatePKCEVerifier = generatePKCEVerifier;
    exports.generatePKCEChallenge = generatePKCEChallenge;
    exports.getCodeChallengeAndMethod = getCodeChallengeAndMethod;
    exports.parseResponseAPIVersion = parseResponseAPIVersion;
    exports.validateExp = validateExp;
    exports.getAlgorithm = getAlgorithm;
    exports.validateUUID = validateUUID;
    exports.userNotAvailableProxy = userNotAvailableProxy;
    exports.insecureUserWarningProxy = insecureUserWarningProxy;
    exports.deepClone = deepClone;
    var constants_1 = require_constants2();
    var errors_1 = require_errors();
    var base64url_1 = require_base64url();
    function expiresAt(expiresIn) {
      const timeNow = Math.round(Date.now() / 1e3);
      return timeNow + expiresIn;
    }
    function generateCallbackId() {
      return Symbol("auth-callback");
    }
    var isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
    exports.isBrowser = isBrowser;
    var localStorageWriteTests = {
      tested: false,
      writable: false
    };
    var supportsLocalStorage = () => {
      if (!(0, exports.isBrowser)()) {
        return false;
      }
      try {
        if (typeof globalThis.localStorage !== "object") {
          return false;
        }
      } catch (e) {
        return false;
      }
      if (localStorageWriteTests.tested) {
        return localStorageWriteTests.writable;
      }
      const randomKey = `lswt-${Math.random()}${Math.random()}`;
      try {
        globalThis.localStorage.setItem(randomKey, randomKey);
        globalThis.localStorage.removeItem(randomKey);
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = true;
      } catch (e) {
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = false;
      }
      return localStorageWriteTests.writable;
    };
    exports.supportsLocalStorage = supportsLocalStorage;
    function parseParametersFromURL(href) {
      const result = {};
      const url = new URL(href);
      if (url.hash && url.hash[0] === "#") {
        try {
          const hashSearchParams = new URLSearchParams(url.hash.substring(1));
          hashSearchParams.forEach((value, key) => {
            result[key] = value;
          });
        } catch (e) {
        }
      }
      url.searchParams.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    var resolveFetch3 = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    exports.resolveFetch = resolveFetch3;
    var looksLikeFetchResponse = (maybeResponse) => {
      return typeof maybeResponse === "object" && maybeResponse !== null && "status" in maybeResponse && "ok" in maybeResponse && "json" in maybeResponse && typeof maybeResponse.json === "function";
    };
    exports.looksLikeFetchResponse = looksLikeFetchResponse;
    var setItemAsync = async (storage, key, data) => {
      await storage.setItem(key, JSON.stringify(data));
    };
    exports.setItemAsync = setItemAsync;
    var getItemAsync = async (storage, key) => {
      const value = await storage.getItem(key);
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch (_a) {
        return value;
      }
    };
    exports.getItemAsync = getItemAsync;
    var removeItemAsync = async (storage, key) => {
      await storage.removeItem(key);
    };
    exports.removeItemAsync = removeItemAsync;
    var Deferred = class _Deferred {
      constructor() {
        ;
        this.promise = new _Deferred.promiseConstructor((res, rej) => {
          ;
          this.resolve = res;
          this.reject = rej;
        });
      }
    };
    exports.Deferred = Deferred;
    Deferred.promiseConstructor = Promise;
    function decodeJWT(token) {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new errors_1.AuthInvalidJwtError("Invalid JWT structure");
      }
      for (let i = 0; i < parts.length; i++) {
        if (!constants_1.BASE64URL_REGEX.test(parts[i])) {
          throw new errors_1.AuthInvalidJwtError("JWT not in base64url format");
        }
      }
      const data = {
        // using base64url lib
        header: JSON.parse((0, base64url_1.stringFromBase64URL)(parts[0])),
        payload: JSON.parse((0, base64url_1.stringFromBase64URL)(parts[1])),
        signature: (0, base64url_1.base64UrlToUint8Array)(parts[2]),
        raw: {
          header: parts[0],
          payload: parts[1]
        }
      };
      return data;
    }
    async function sleep3(time) {
      return await new Promise((accept) => {
        setTimeout(() => accept(null), time);
      });
    }
    function retryable(fn, isRetryable) {
      const promise = new Promise((accept, reject) => {
        ;
        (async () => {
          for (let attempt = 0; attempt < Infinity; attempt++) {
            try {
              const result = await fn(attempt);
              if (!isRetryable(attempt, null, result)) {
                accept(result);
                return;
              }
            } catch (e) {
              if (!isRetryable(attempt, e)) {
                reject(e);
                return;
              }
            }
          }
        })();
      });
      return promise;
    }
    function dec2hex(dec) {
      return ("0" + dec.toString(16)).substr(-2);
    }
    function generatePKCEVerifier() {
      const verifierLength = 56;
      const array = new Uint32Array(verifierLength);
      if (typeof crypto === "undefined") {
        const charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        const charSetLen = charSet.length;
        let verifier = "";
        for (let i = 0; i < verifierLength; i++) {
          verifier += charSet.charAt(Math.floor(Math.random() * charSetLen));
        }
        return verifier;
      }
      crypto.getRandomValues(array);
      return Array.from(array, dec2hex).join("");
    }
    async function sha256(randomString) {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(randomString);
      const hash = await crypto.subtle.digest("SHA-256", encodedData);
      const bytes = new Uint8Array(hash);
      return Array.from(bytes).map((c) => String.fromCharCode(c)).join("");
    }
    async function generatePKCEChallenge(verifier) {
      const hasCryptoSupport = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined";
      if (!hasCryptoSupport) {
        console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.");
        return verifier;
      }
      const hashed = await sha256(verifier);
      return btoa(hashed).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    async function getCodeChallengeAndMethod(storage, storageKey, isPasswordRecovery = false) {
      const codeVerifier = generatePKCEVerifier();
      let storedCodeVerifier = codeVerifier;
      if (isPasswordRecovery) {
        storedCodeVerifier += "/PASSWORD_RECOVERY";
      }
      await (0, exports.setItemAsync)(storage, `${storageKey}-code-verifier`, storedCodeVerifier);
      const codeChallenge = await generatePKCEChallenge(codeVerifier);
      const codeChallengeMethod = codeVerifier === codeChallenge ? "plain" : "s256";
      return [codeChallenge, codeChallengeMethod];
    }
    var API_VERSION_REGEX = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
    function parseResponseAPIVersion(response) {
      const apiVersion = response.headers.get(constants_1.API_VERSION_HEADER_NAME);
      if (!apiVersion) {
        return null;
      }
      if (!apiVersion.match(API_VERSION_REGEX)) {
        return null;
      }
      try {
        const date = /* @__PURE__ */ new Date(`${apiVersion}T00:00:00.0Z`);
        return date;
      } catch (e) {
        return null;
      }
    }
    function validateExp(exp) {
      if (!exp) {
        throw new Error("Missing exp claim");
      }
      const timeNow = Math.floor(Date.now() / 1e3);
      if (exp <= timeNow) {
        throw new Error("JWT has expired");
      }
    }
    function getAlgorithm(alg) {
      switch (alg) {
        case "RS256":
          return {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-256" }
          };
        case "ES256":
          return {
            name: "ECDSA",
            namedCurve: "P-256",
            hash: { name: "SHA-256" }
          };
        default:
          throw new Error("Invalid alg claim");
      }
    }
    var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    function validateUUID(str) {
      if (!UUID_REGEX.test(str)) {
        throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
      }
    }
    function userNotAvailableProxy() {
      const proxyTarget = {};
      return new Proxy(proxyTarget, {
        get: (target, prop) => {
          if (prop === "__isUserNotAvailableProxy") {
            return true;
          }
          if (typeof prop === "symbol") {
            const sProp = prop.toString();
            if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)") {
              return void 0;
            }
          }
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${prop}" property of the session object is not supported. Please use getUser() instead.`);
        },
        set: (_target, prop) => {
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
        },
        deleteProperty: (_target, prop) => {
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
        }
      });
    }
    function insecureUserWarningProxy(user, suppressWarningRef) {
      return new Proxy(user, {
        get: (target, prop, receiver) => {
          if (prop === "__isInsecureUserWarningProxy") {
            return true;
          }
          if (typeof prop === "symbol") {
            const sProp = prop.toString();
            if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)" || sProp === "Symbol(nodejs.util.inspect.custom)") {
              return Reflect.get(target, prop, receiver);
            }
          }
          if (!suppressWarningRef.value && typeof prop === "string") {
            console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server.");
            suppressWarningRef.value = true;
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    }
    function deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/fetch.js
var require_fetch = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/fetch.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.handleError = handleError2;
    exports._request = _request;
    exports._sessionResponse = _sessionResponse;
    exports._sessionResponsePassword = _sessionResponsePassword;
    exports._userResponse = _userResponse;
    exports._ssoResponse = _ssoResponse;
    exports._generateLinkResponse = _generateLinkResponse;
    exports._noResolveJsonResponse = _noResolveJsonResponse;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var constants_1 = require_constants2();
    var helpers_1 = require_helpers();
    var errors_1 = require_errors();
    var _getErrorMessage2 = (err) => err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
    var NETWORK_ERROR_CODES = [502, 503, 504];
    async function handleError2(error) {
      var _a;
      if (!(0, helpers_1.looksLikeFetchResponse)(error)) {
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage2(error), 0);
      }
      if (NETWORK_ERROR_CODES.includes(error.status)) {
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage2(error), error.status);
      }
      let data;
      try {
        data = await error.json();
      } catch (e) {
        throw new errors_1.AuthUnknownError(_getErrorMessage2(e), e);
      }
      let errorCode = void 0;
      const responseAPIVersion = (0, helpers_1.parseResponseAPIVersion)(error);
      if (responseAPIVersion && responseAPIVersion.getTime() >= constants_1.API_VERSIONS["2024-01-01"].timestamp && typeof data === "object" && data && typeof data.code === "string") {
        errorCode = data.code;
      } else if (typeof data === "object" && data && typeof data.error_code === "string") {
        errorCode = data.error_code;
      }
      if (!errorCode) {
        if (typeof data === "object" && data && typeof data.weak_password === "object" && data.weak_password && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
          throw new errors_1.AuthWeakPasswordError(_getErrorMessage2(data), error.status, data.weak_password.reasons);
        }
      } else if (errorCode === "weak_password") {
        throw new errors_1.AuthWeakPasswordError(_getErrorMessage2(data), error.status, ((_a = data.weak_password) === null || _a === void 0 ? void 0 : _a.reasons) || []);
      } else if (errorCode === "session_not_found") {
        throw new errors_1.AuthSessionMissingError();
      }
      throw new errors_1.AuthApiError(_getErrorMessage2(data), error.status || 500, errorCode);
    }
    var _getRequestParams2 = (method, options, parameters, body) => {
      const params = { method, headers: (options === null || options === void 0 ? void 0 : options.headers) || {} };
      if (method === "GET") {
        return params;
      }
      params.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, options === null || options === void 0 ? void 0 : options.headers);
      params.body = JSON.stringify(body);
      return Object.assign(Object.assign({}, params), parameters);
    };
    async function _request(fetcher, method, url, options) {
      var _a;
      const headers = Object.assign({}, options === null || options === void 0 ? void 0 : options.headers);
      if (!headers[constants_1.API_VERSION_HEADER_NAME]) {
        headers[constants_1.API_VERSION_HEADER_NAME] = constants_1.API_VERSIONS["2024-01-01"].name;
      }
      if (options === null || options === void 0 ? void 0 : options.jwt) {
        headers["Authorization"] = `Bearer ${options.jwt}`;
      }
      const qs = (_a = options === null || options === void 0 ? void 0 : options.query) !== null && _a !== void 0 ? _a : {};
      if (options === null || options === void 0 ? void 0 : options.redirectTo) {
        qs["redirect_to"] = options.redirectTo;
      }
      const queryString = Object.keys(qs).length ? "?" + new URLSearchParams(qs).toString() : "";
      const data = await _handleRequest2(fetcher, method, url + queryString, {
        headers,
        noResolveJson: options === null || options === void 0 ? void 0 : options.noResolveJson
      }, {}, options === null || options === void 0 ? void 0 : options.body);
      return (options === null || options === void 0 ? void 0 : options.xform) ? options === null || options === void 0 ? void 0 : options.xform(data) : { data: Object.assign({}, data), error: null };
    }
    async function _handleRequest2(fetcher, method, url, options, parameters, body) {
      const requestParams = _getRequestParams2(method, options, parameters, body);
      let result;
      try {
        result = await fetcher(url, Object.assign({}, requestParams));
      } catch (e) {
        console.error(e);
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage2(e), 0);
      }
      if (!result.ok) {
        await handleError2(result);
      }
      if (options === null || options === void 0 ? void 0 : options.noResolveJson) {
        return result;
      }
      try {
        return await result.json();
      } catch (e) {
        await handleError2(e);
      }
    }
    function _sessionResponse(data) {
      var _a;
      let session = null;
      if (hasSession(data)) {
        session = Object.assign({}, data);
        if (!data.expires_at) {
          session.expires_at = (0, helpers_1.expiresAt)(data.expires_in);
        }
      }
      const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
      return { data: { session, user }, error: null };
    }
    function _sessionResponsePassword(data) {
      const response = _sessionResponse(data);
      if (!response.error && data.weak_password && typeof data.weak_password === "object" && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.message && typeof data.weak_password.message === "string" && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
        response.data.weak_password = data.weak_password;
      }
      return response;
    }
    function _userResponse(data) {
      var _a;
      const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
      return { data: { user }, error: null };
    }
    function _ssoResponse(data) {
      return { data, error: null };
    }
    function _generateLinkResponse(data) {
      const { action_link, email_otp, hashed_token, redirect_to, verification_type } = data, rest = tslib_1.__rest(data, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]);
      const properties = {
        action_link,
        email_otp,
        hashed_token,
        redirect_to,
        verification_type
      };
      const user = Object.assign({}, rest);
      return {
        data: {
          properties,
          user
        },
        error: null
      };
    }
    function _noResolveJsonResponse(data) {
      return data;
    }
    function hasSession(data) {
      return data.access_token && data.refresh_token && data.expires_in;
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/types.js
var require_types2 = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SIGN_OUT_SCOPES = void 0;
    exports.SIGN_OUT_SCOPES = ["global", "local", "others"];
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js
var require_GoTrueAdminApi = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var fetch_1 = require_fetch();
    var helpers_1 = require_helpers();
    var types_1 = require_types2();
    var errors_1 = require_errors();
    var GoTrueAdminApi = class {
      /**
       * Creates an admin API client that can be used to manage users and OAuth clients.
       *
       * @example
       * ```ts
       * import { GoTrueAdminApi } from '@supabase/auth-js'
       *
       * const admin = new GoTrueAdminApi({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
       * })
       * ```
       */
      constructor({ url = "", headers = {}, fetch: fetch2 }) {
        this.url = url;
        this.headers = headers;
        this.fetch = (0, helpers_1.resolveFetch)(fetch2);
        this.mfa = {
          listFactors: this._listFactors.bind(this),
          deleteFactor: this._deleteFactor.bind(this)
        };
        this.oauth = {
          listClients: this._listOAuthClients.bind(this),
          createClient: this._createOAuthClient.bind(this),
          getClient: this._getOAuthClient.bind(this),
          updateClient: this._updateOAuthClient.bind(this),
          deleteClient: this._deleteOAuthClient.bind(this),
          regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this)
        };
      }
      /**
       * Removes a logged-in session.
       * @param jwt A valid, logged-in JWT.
       * @param scope The logout sope.
       */
      async signOut(jwt, scope = types_1.SIGN_OUT_SCOPES[0]) {
        if (types_1.SIGN_OUT_SCOPES.indexOf(scope) < 0) {
          throw new Error(`@supabase/auth-js: Parameter scope must be one of ${types_1.SIGN_OUT_SCOPES.join(", ")}`);
        }
        try {
          await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/logout?scope=${scope}`, {
            headers: this.headers,
            jwt,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Sends an invite link to an email address.
       * @param email The email address of the user.
       * @param options Additional options to be included when inviting.
       */
      async inviteUserByEmail(email, options = {}) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/invite`, {
            body: { email, data: options.data },
            headers: this.headers,
            redirectTo: options.redirectTo,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Generates email links and OTPs to be sent via a custom email provider.
       * @param email The user's email.
       * @param options.password User password. For signup only.
       * @param options.data Optional user metadata. For signup only.
       * @param options.redirectTo The redirect url which should be appended to the generated link
       */
      async generateLink(params) {
        try {
          const { options } = params, rest = tslib_1.__rest(params, ["options"]);
          const body = Object.assign(Object.assign({}, rest), options);
          if ("newEmail" in rest) {
            body.new_email = rest === null || rest === void 0 ? void 0 : rest.newEmail;
            delete body["newEmail"];
          }
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/generate_link`, {
            body,
            headers: this.headers,
            xform: fetch_1._generateLinkResponse,
            redirectTo: options === null || options === void 0 ? void 0 : options.redirectTo
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return {
              data: {
                properties: null,
                user: null
              },
              error
            };
          }
          throw error;
        }
      }
      // User Admin API
      /**
       * Creates a new user.
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async createUser(attributes) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/users`, {
            body: attributes,
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Get a list of users.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
       */
      async listUsers(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: fetch_1._noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const users = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, users), pagination), error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { users: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Get user by id.
       *
       * @param uid The user's unique identifier
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async getUserById(uid) {
        (0, helpers_1.validateUUID)(uid);
        try {
          return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users/${uid}`, {
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Updates the user data. Changes are applied directly without confirmation flows.
       *
       * @param uid The user's unique identifier
       * @param attributes The data you want to update.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       *
       * @remarks
       * **Important:** This is a server-side operation and does **not** trigger client-side
       * `onAuthStateChange` listeners. The admin API has no connection to client state.
       *
       * To sync changes to the client after calling this method:
       * 1. On the client, call `supabase.auth.refreshSession()` to fetch the updated user data
       * 2. This will trigger the `TOKEN_REFRESHED` event and notify all listeners
       *
       * @example
       * ```typescript
       * // Server-side (Edge Function)
       * const { data, error } = await supabase.auth.admin.updateUserById(
       *   userId,
       *   { user_metadata: { preferences: { theme: 'dark' } } }
       * )
       *
       * // Client-side (to sync the changes)
       * const { data, error } = await supabase.auth.refreshSession()
       * // onAuthStateChange listeners will now be notified with updated user
       * ```
       *
       * @see {@link GoTrueClient.refreshSession} for syncing admin changes to the client
       * @see {@link GoTrueClient.updateUser} for client-side user updates (triggers listeners automatically)
       */
      async updateUserById(uid, attributes) {
        (0, helpers_1.validateUUID)(uid);
        try {
          return await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/admin/users/${uid}`, {
            body: attributes,
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Delete a user. Requires a `service_role` key.
       *
       * @param id The user id you want to remove.
       * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema. Soft deletion allows user identification from the hashed user ID but is not reversible.
       * Defaults to false for backward compatibility.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async deleteUser(id, shouldSoftDelete = false) {
        (0, helpers_1.validateUUID)(id);
        try {
          return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/users/${id}`, {
            headers: this.headers,
            body: {
              should_soft_delete: shouldSoftDelete
            },
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      async _listFactors(params) {
        (0, helpers_1.validateUUID)(params.userId);
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users/${params.userId}/factors`, {
            headers: this.headers,
            xform: (factors) => {
              return { data: { factors }, error: null };
            }
          });
          return { data, error };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      async _deleteFactor(params) {
        (0, helpers_1.validateUUID)(params.userId);
        (0, helpers_1.validateUUID)(params.id);
        try {
          const data = await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/users/${params.userId}/factors/${params.id}`, {
            headers: this.headers
          });
          return { data, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth clients with optional pagination.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _listOAuthClients(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/oauth/clients`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: fetch_1._noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const clients = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, clients), pagination), error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { clients: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Creates a new OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _createOAuthClient(params) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/oauth/clients`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Gets details of a specific OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _getOAuthClient(clientId) {
        try {
          return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Updates an existing OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _updateOAuthClient(clientId, params) {
        try {
          return await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${clientId}`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Deletes an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _deleteOAuthClient(clientId) {
        try {
          await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Regenerates the secret for an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _regenerateOAuthClientSecret(clientId) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/oauth/clients/${clientId}/regenerate_secret`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
    };
    exports.default = GoTrueAdminApi;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/local-storage.js
var require_local_storage = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/local-storage.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.memoryLocalStorageAdapter = memoryLocalStorageAdapter;
    function memoryLocalStorageAdapter(store = {}) {
      return {
        getItem: (key) => {
          return store[key] || null;
        },
        setItem: (key, value) => {
          store[key] = value;
        },
        removeItem: (key) => {
          delete store[key];
        }
      };
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/locks.js
var require_locks = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/locks.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ProcessLockAcquireTimeoutError = exports.NavigatorLockAcquireTimeoutError = exports.LockAcquireTimeoutError = exports.internals = void 0;
    exports.navigatorLock = navigatorLock;
    exports.processLock = processLock;
    var helpers_1 = require_helpers();
    exports.internals = {
      /**
       * @experimental
       */
      debug: !!(globalThis && (0, helpers_1.supportsLocalStorage)() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true")
    };
    var LockAcquireTimeoutError = class extends Error {
      constructor(message) {
        super(message);
        this.isAcquireTimeout = true;
      }
    };
    exports.LockAcquireTimeoutError = LockAcquireTimeoutError;
    var NavigatorLockAcquireTimeoutError = class extends LockAcquireTimeoutError {
    };
    exports.NavigatorLockAcquireTimeoutError = NavigatorLockAcquireTimeoutError;
    var ProcessLockAcquireTimeoutError = class extends LockAcquireTimeoutError {
    };
    exports.ProcessLockAcquireTimeoutError = ProcessLockAcquireTimeoutError;
    async function navigatorLock(name, acquireTimeout, fn) {
      if (exports.internals.debug) {
        console.log("@supabase/gotrue-js: navigatorLock: acquire lock", name, acquireTimeout);
      }
      const abortController = new globalThis.AbortController();
      if (acquireTimeout > 0) {
        setTimeout(() => {
          abortController.abort();
          if (exports.internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock acquire timed out", name);
          }
        }, acquireTimeout);
      }
      await Promise.resolve();
      try {
        return await globalThis.navigator.locks.request(name, acquireTimeout === 0 ? {
          mode: "exclusive",
          ifAvailable: true
        } : {
          mode: "exclusive",
          signal: abortController.signal
        }, async (lock) => {
          if (lock) {
            if (exports.internals.debug) {
              console.log("@supabase/gotrue-js: navigatorLock: acquired", name, lock.name);
            }
            try {
              return await fn();
            } finally {
              if (exports.internals.debug) {
                console.log("@supabase/gotrue-js: navigatorLock: released", name, lock.name);
              }
            }
          } else {
            if (acquireTimeout === 0) {
              if (exports.internals.debug) {
                console.log("@supabase/gotrue-js: navigatorLock: not immediately available", name);
              }
              throw new NavigatorLockAcquireTimeoutError(`Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`);
            } else {
              if (exports.internals.debug) {
                try {
                  const result = await globalThis.navigator.locks.query();
                  console.log("@supabase/gotrue-js: Navigator LockManager state", JSON.stringify(result, null, "  "));
                } catch (e) {
                  console.warn("@supabase/gotrue-js: Error when querying Navigator LockManager state", e);
                }
              }
              console.warn("@supabase/gotrue-js: Navigator LockManager returned a null lock when using #request without ifAvailable set to true, it appears this browser is not following the LockManager spec https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request");
              return await fn();
            }
          }
        });
      } catch (e) {
        if ((e === null || e === void 0 ? void 0 : e.name) === "AbortError" && acquireTimeout > 0) {
          if (exports.internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: acquire timeout, recovering by stealing lock", name);
          }
          console.warn(`@supabase/gotrue-js: Lock "${name}" was not released within ${acquireTimeout}ms. This may indicate an orphaned lock from a component unmount (e.g., React Strict Mode). Forcefully acquiring the lock to recover.`);
          return await Promise.resolve().then(() => globalThis.navigator.locks.request(name, {
            mode: "exclusive",
            steal: true
          }, async (lock) => {
            if (lock) {
              if (exports.internals.debug) {
                console.log("@supabase/gotrue-js: navigatorLock: recovered (stolen)", name, lock.name);
              }
              try {
                return await fn();
              } finally {
                if (exports.internals.debug) {
                  console.log("@supabase/gotrue-js: navigatorLock: released (stolen)", name, lock.name);
                }
              }
            } else {
              console.warn("@supabase/gotrue-js: Navigator LockManager returned null lock even with steal: true");
              return await fn();
            }
          }));
        }
        throw e;
      }
    }
    var PROCESS_LOCKS = {};
    async function processLock(name, acquireTimeout, fn) {
      var _a;
      const previousOperation = (_a = PROCESS_LOCKS[name]) !== null && _a !== void 0 ? _a : Promise.resolve();
      const previousOperationHandled = (async () => {
        try {
          await previousOperation;
          return null;
        } catch (e) {
          return null;
        }
      })();
      const currentOperation = (async () => {
        let timeoutId = null;
        try {
          const timeoutPromise = acquireTimeout >= 0 ? new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              console.warn(`@supabase/gotrue-js: Lock "${name}" acquisition timed out after ${acquireTimeout}ms. This may be caused by another operation holding the lock. Consider increasing lockAcquireTimeout or checking for stuck operations.`);
              reject(new ProcessLockAcquireTimeoutError(`Acquiring process lock with name "${name}" timed out`));
            }, acquireTimeout);
          }) : null;
          await Promise.race([previousOperationHandled, timeoutPromise].filter((x) => x));
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
        } catch (e) {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
          if (e && e.isAcquireTimeout) {
            throw e;
          }
        }
        return await fn();
      })();
      PROCESS_LOCKS[name] = (async () => {
        try {
          return await currentOperation;
        } catch (e) {
          if (e && e.isAcquireTimeout) {
            try {
              await previousOperation;
            } catch (prevError) {
            }
            return null;
          }
          throw e;
        }
      })();
      return await currentOperation;
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/polyfills.js
var require_polyfills = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/polyfills.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.polyfillGlobalThis = polyfillGlobalThis;
    function polyfillGlobalThis() {
      if (typeof globalThis === "object")
        return;
      try {
        Object.defineProperty(Object.prototype, "__magic__", {
          get: function() {
            return this;
          },
          configurable: true
        });
        __magic__.globalThis = __magic__;
        delete Object.prototype.__magic__;
      } catch (e) {
        if (typeof self !== "undefined") {
          self.globalThis = self;
        }
      }
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/web3/ethereum.js
var require_ethereum = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/web3/ethereum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getAddress = getAddress;
    exports.fromHex = fromHex;
    exports.toHex = toHex;
    exports.createSiweMessage = createSiweMessage;
    function getAddress(address) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`@supabase/auth-js: Address "${address}" is invalid.`);
      }
      return address.toLowerCase();
    }
    function fromHex(hex) {
      return parseInt(hex, 16);
    }
    function toHex(value) {
      const bytes = new TextEncoder().encode(value);
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return "0x" + hex;
    }
    function createSiweMessage(parameters) {
      var _a;
      const { chainId, domain, expirationTime, issuedAt = /* @__PURE__ */ new Date(), nonce, notBefore, requestId, resources, scheme, uri, version: version3 } = parameters;
      {
        if (!Number.isInteger(chainId))
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${chainId}`);
        if (!domain)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.`);
        if (nonce && nonce.length < 8)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${nonce}`);
        if (!uri)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.`);
        if (version3 !== "1")
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${version3}`);
        if ((_a = parameters.statement) === null || _a === void 0 ? void 0 : _a.includes("\n"))
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${parameters.statement}`);
      }
      const address = getAddress(parameters.address);
      const origin = scheme ? `${scheme}://${domain}` : domain;
      const statement = parameters.statement ? `${parameters.statement}
` : "";
      const prefix = `${origin} wants you to sign in with your Ethereum account:
${address}

${statement}`;
      let suffix = `URI: ${uri}
Version: ${version3}
Chain ID: ${chainId}${nonce ? `
Nonce: ${nonce}` : ""}
Issued At: ${issuedAt.toISOString()}`;
      if (expirationTime)
        suffix += `
Expiration Time: ${expirationTime.toISOString()}`;
      if (notBefore)
        suffix += `
Not Before: ${notBefore.toISOString()}`;
      if (requestId)
        suffix += `
Request ID: ${requestId}`;
      if (resources) {
        let content = "\nResources:";
        for (const resource of resources) {
          if (!resource || typeof resource !== "string")
            throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${resource}`);
          content += `
- ${resource}`;
        }
        suffix += content;
      }
      return `${prefix}
${suffix}`;
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/webauthn.errors.js
var require_webauthn_errors = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/webauthn.errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebAuthnUnknownError = exports.WebAuthnError = void 0;
    exports.isWebAuthnError = isWebAuthnError;
    exports.identifyRegistrationError = identifyRegistrationError;
    exports.identifyAuthenticationError = identifyAuthenticationError;
    var webauthn_1 = require_webauthn();
    var WebAuthnError = class extends Error {
      constructor({ message, code, cause, name }) {
        var _a;
        super(message, { cause });
        this.__isWebAuthnError = true;
        this.name = (_a = name !== null && name !== void 0 ? name : cause instanceof Error ? cause.name : void 0) !== null && _a !== void 0 ? _a : "Unknown Error";
        this.code = code;
      }
    };
    exports.WebAuthnError = WebAuthnError;
    var WebAuthnUnknownError = class extends WebAuthnError {
      constructor(message, originalError) {
        super({
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: originalError,
          message
        });
        this.name = "WebAuthnUnknownError";
        this.originalError = originalError;
      }
    };
    exports.WebAuthnUnknownError = WebAuthnUnknownError;
    function isWebAuthnError(error) {
      return typeof error === "object" && error !== null && "__isWebAuthnError" in error;
    }
    function identifyRegistrationError({ error, options }) {
      var _a, _b, _c;
      const { publicKey } = options;
      if (!publicKey) {
        throw Error("options was missing required publicKey property");
      }
      if (error.name === "AbortError") {
        if (options.signal instanceof AbortSignal) {
          return new WebAuthnError({
            message: "Registration ceremony was sent an abort signal",
            code: "ERROR_CEREMONY_ABORTED",
            cause: error
          });
        }
      } else if (error.name === "ConstraintError") {
        if (((_a = publicKey.authenticatorSelection) === null || _a === void 0 ? void 0 : _a.requireResidentKey) === true) {
          return new WebAuthnError({
            message: "Discoverable credentials were required but no available authenticator supported it",
            code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
            cause: error
          });
        } else if (
          // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
          options.mediation === "conditional" && ((_b = publicKey.authenticatorSelection) === null || _b === void 0 ? void 0 : _b.userVerification) === "required"
        ) {
          return new WebAuthnError({
            message: "User verification was required during automatic registration but it could not be performed",
            code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
            cause: error
          });
        } else if (((_c = publicKey.authenticatorSelection) === null || _c === void 0 ? void 0 : _c.userVerification) === "required") {
          return new WebAuthnError({
            message: "User verification was required but no available authenticator supported it",
            code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
            cause: error
          });
        }
      } else if (error.name === "InvalidStateError") {
        return new WebAuthnError({
          message: "The authenticator was previously registered",
          code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
          cause: error
        });
      } else if (error.name === "NotAllowedError") {
        return new WebAuthnError({
          message: error.message,
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: error
        });
      } else if (error.name === "NotSupportedError") {
        const validPubKeyCredParams = publicKey.pubKeyCredParams.filter((param) => param.type === "public-key");
        if (validPubKeyCredParams.length === 0) {
          return new WebAuthnError({
            message: 'No entry in pubKeyCredParams was of type "public-key"',
            code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
            cause: error
          });
        }
        return new WebAuthnError({
          message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
          code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
          cause: error
        });
      } else if (error.name === "SecurityError") {
        const effectiveDomain = window.location.hostname;
        if (!(0, webauthn_1.isValidDomain)(effectiveDomain)) {
          return new WebAuthnError({
            message: `${window.location.hostname} is an invalid domain`,
            code: "ERROR_INVALID_DOMAIN",
            cause: error
          });
        } else if (publicKey.rp.id !== effectiveDomain) {
          return new WebAuthnError({
            message: `The RP ID "${publicKey.rp.id}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: error
          });
        }
      } else if (error.name === "TypeError") {
        if (publicKey.user.id.byteLength < 1 || publicKey.user.id.byteLength > 64) {
          return new WebAuthnError({
            message: "User ID was not between 1 and 64 characters",
            code: "ERROR_INVALID_USER_ID_LENGTH",
            cause: error
          });
        }
      } else if (error.name === "UnknownError") {
        return new WebAuthnError({
          message: "The authenticator was unable to process the specified options, or could not create a new credential",
          code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
          cause: error
        });
      }
      return new WebAuthnError({
        message: "a Non-Webauthn related error has occurred",
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: error
      });
    }
    function identifyAuthenticationError({ error, options }) {
      const { publicKey } = options;
      if (!publicKey) {
        throw Error("options was missing required publicKey property");
      }
      if (error.name === "AbortError") {
        if (options.signal instanceof AbortSignal) {
          return new WebAuthnError({
            message: "Authentication ceremony was sent an abort signal",
            code: "ERROR_CEREMONY_ABORTED",
            cause: error
          });
        }
      } else if (error.name === "NotAllowedError") {
        return new WebAuthnError({
          message: error.message,
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: error
        });
      } else if (error.name === "SecurityError") {
        const effectiveDomain = window.location.hostname;
        if (!(0, webauthn_1.isValidDomain)(effectiveDomain)) {
          return new WebAuthnError({
            message: `${window.location.hostname} is an invalid domain`,
            code: "ERROR_INVALID_DOMAIN",
            cause: error
          });
        } else if (publicKey.rpId !== effectiveDomain) {
          return new WebAuthnError({
            message: `The RP ID "${publicKey.rpId}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: error
          });
        }
      } else if (error.name === "UnknownError") {
        return new WebAuthnError({
          message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
          code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
          cause: error
        });
      }
      return new WebAuthnError({
        message: "a Non-Webauthn related error has occurred",
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: error
      });
    }
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/lib/webauthn.js
var require_webauthn = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/lib/webauthn.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebAuthnApi = exports.DEFAULT_REQUEST_OPTIONS = exports.DEFAULT_CREATION_OPTIONS = exports.webAuthnAbortService = exports.WebAuthnAbortService = exports.identifyAuthenticationError = exports.identifyRegistrationError = exports.isWebAuthnError = exports.WebAuthnError = void 0;
    exports.deserializeCredentialCreationOptions = deserializeCredentialCreationOptions;
    exports.deserializeCredentialRequestOptions = deserializeCredentialRequestOptions;
    exports.serializeCredentialCreationResponse = serializeCredentialCreationResponse;
    exports.serializeCredentialRequestResponse = serializeCredentialRequestResponse;
    exports.isValidDomain = isValidDomain;
    exports.createCredential = createCredential;
    exports.getCredential = getCredential;
    exports.mergeCredentialCreationOptions = mergeCredentialCreationOptions;
    exports.mergeCredentialRequestOptions = mergeCredentialRequestOptions;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var base64url_1 = require_base64url();
    var errors_1 = require_errors();
    var helpers_1 = require_helpers();
    var webauthn_errors_1 = require_webauthn_errors();
    Object.defineProperty(exports, "identifyAuthenticationError", { enumerable: true, get: function() {
      return webauthn_errors_1.identifyAuthenticationError;
    } });
    Object.defineProperty(exports, "identifyRegistrationError", { enumerable: true, get: function() {
      return webauthn_errors_1.identifyRegistrationError;
    } });
    Object.defineProperty(exports, "isWebAuthnError", { enumerable: true, get: function() {
      return webauthn_errors_1.isWebAuthnError;
    } });
    Object.defineProperty(exports, "WebAuthnError", { enumerable: true, get: function() {
      return webauthn_errors_1.WebAuthnError;
    } });
    var WebAuthnAbortService = class {
      /**
       * Create an abort signal for a new WebAuthn operation.
       * Automatically cancels any existing operation.
       *
       * @returns {AbortSignal} Signal to pass to navigator.credentials.create() or .get()
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal MDN - AbortSignal}
       */
      createNewAbortSignal() {
        if (this.controller) {
          const abortError = new Error("Cancelling existing WebAuthn API call for new one");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
        }
        const newController = new AbortController();
        this.controller = newController;
        return newController.signal;
      }
      /**
       * Manually cancel the current WebAuthn operation.
       * Useful for cleaning up when user cancels or navigates away.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort MDN - AbortController.abort}
       */
      cancelCeremony() {
        if (this.controller) {
          const abortError = new Error("Manually cancelling existing WebAuthn API call");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
          this.controller = void 0;
        }
      }
    };
    exports.WebAuthnAbortService = WebAuthnAbortService;
    exports.webAuthnAbortService = new WebAuthnAbortService();
    function deserializeCredentialCreationOptions(options) {
      if (!options) {
        throw new Error("Credential creation options are required");
      }
      if (typeof PublicKeyCredential !== "undefined" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function") {
        return PublicKeyCredential.parseCreationOptionsFromJSON(
          /** we assert the options here as typescript still doesn't know about future webauthn types */
          options
        );
      }
      const { challenge: challengeStr, user: userOpts, excludeCredentials } = options, restOptions = tslib_1.__rest(
        options,
        ["challenge", "user", "excludeCredentials"]
      );
      const challenge = (0, base64url_1.base64UrlToUint8Array)(challengeStr).buffer;
      const user = Object.assign(Object.assign({}, userOpts), { id: (0, base64url_1.base64UrlToUint8Array)(userOpts.id).buffer });
      const result = Object.assign(Object.assign({}, restOptions), {
        challenge,
        user
      });
      if (excludeCredentials && excludeCredentials.length > 0) {
        result.excludeCredentials = new Array(excludeCredentials.length);
        for (let i = 0; i < excludeCredentials.length; i++) {
          const cred = excludeCredentials[i];
          result.excludeCredentials[i] = Object.assign(Object.assign({}, cred), {
            id: (0, base64url_1.base64UrlToUint8Array)(cred.id).buffer,
            type: cred.type || "public-key",
            // Cast transports to handle future transport types like "cable"
            transports: cred.transports
          });
        }
      }
      return result;
    }
    function deserializeCredentialRequestOptions(options) {
      if (!options) {
        throw new Error("Credential request options are required");
      }
      if (typeof PublicKeyCredential !== "undefined" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function") {
        return PublicKeyCredential.parseRequestOptionsFromJSON(options);
      }
      const { challenge: challengeStr, allowCredentials } = options, restOptions = tslib_1.__rest(
        options,
        ["challenge", "allowCredentials"]
      );
      const challenge = (0, base64url_1.base64UrlToUint8Array)(challengeStr).buffer;
      const result = Object.assign(Object.assign({}, restOptions), { challenge });
      if (allowCredentials && allowCredentials.length > 0) {
        result.allowCredentials = new Array(allowCredentials.length);
        for (let i = 0; i < allowCredentials.length; i++) {
          const cred = allowCredentials[i];
          result.allowCredentials[i] = Object.assign(Object.assign({}, cred), {
            id: (0, base64url_1.base64UrlToUint8Array)(cred.id).buffer,
            type: cred.type || "public-key",
            // Cast transports to handle future transport types like "cable"
            transports: cred.transports
          });
        }
      }
      return result;
    }
    function serializeCredentialCreationResponse(credential) {
      var _a;
      if ("toJSON" in credential && typeof credential.toJSON === "function") {
        return credential.toJSON();
      }
      const credentialWithAttachment = credential;
      return {
        id: credential.id,
        rawId: credential.id,
        response: {
          attestationObject: (0, base64url_1.bytesToBase64URL)(new Uint8Array(credential.response.attestationObject)),
          clientDataJSON: (0, base64url_1.bytesToBase64URL)(new Uint8Array(credential.response.clientDataJSON))
        },
        type: "public-key",
        clientExtensionResults: credential.getClientExtensionResults(),
        // Convert null to undefined and cast to AuthenticatorAttachment type
        authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
      };
    }
    function serializeCredentialRequestResponse(credential) {
      var _a;
      if ("toJSON" in credential && typeof credential.toJSON === "function") {
        return credential.toJSON();
      }
      const credentialWithAttachment = credential;
      const clientExtensionResults = credential.getClientExtensionResults();
      const assertionResponse = credential.response;
      return {
        id: credential.id,
        rawId: credential.id,
        // W3C spec expects rawId to match id for JSON format
        response: {
          authenticatorData: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.authenticatorData)),
          clientDataJSON: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.clientDataJSON)),
          signature: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.signature)),
          userHandle: assertionResponse.userHandle ? (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.userHandle)) : void 0
        },
        type: "public-key",
        clientExtensionResults,
        // Convert null to undefined and cast to AuthenticatorAttachment type
        authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
      };
    }
    function isValidDomain(hostname) {
      return (
        // Consider localhost valid as well since it's okay wrt Secure Contexts
        hostname === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(hostname)
      );
    }
    function browserSupportsWebAuthn() {
      var _a, _b;
      return !!((0, helpers_1.isBrowser)() && "PublicKeyCredential" in window && window.PublicKeyCredential && "credentials" in navigator && typeof ((_a = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _a === void 0 ? void 0 : _a.create) === "function" && typeof ((_b = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _b === void 0 ? void 0 : _b.get) === "function");
    }
    async function createCredential(options) {
      try {
        const response = await navigator.credentials.create(
          /** we assert the type here until typescript types are updated */
          options
        );
        if (!response) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Empty credential response", response)
          };
        }
        if (!(response instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Browser returned unexpected credential type", response)
          };
        }
        return { data: response, error: null };
      } catch (err) {
        return {
          data: null,
          error: (0, webauthn_errors_1.identifyRegistrationError)({
            error: err,
            options
          })
        };
      }
    }
    async function getCredential(options) {
      try {
        const response = await navigator.credentials.get(
          /** we assert the type here until typescript types are updated */
          options
        );
        if (!response) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Empty credential response", response)
          };
        }
        if (!(response instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Browser returned unexpected credential type", response)
          };
        }
        return { data: response, error: null };
      } catch (err) {
        return {
          data: null,
          error: (0, webauthn_errors_1.identifyAuthenticationError)({
            error: err,
            options
          })
        };
      }
    }
    exports.DEFAULT_CREATION_OPTIONS = {
      hints: ["security-key"],
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform",
        requireResidentKey: false,
        /** set to preferred because older yubikeys don't have PIN/Biometric */
        userVerification: "preferred",
        residentKey: "discouraged"
      },
      attestation: "direct"
    };
    exports.DEFAULT_REQUEST_OPTIONS = {
      /** set to preferred because older yubikeys don't have PIN/Biometric */
      userVerification: "preferred",
      hints: ["security-key"],
      attestation: "direct"
    };
    function deepMerge(...sources) {
      const isObject2 = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
      const isArrayBufferLike = (val) => val instanceof ArrayBuffer || ArrayBuffer.isView(val);
      const result = {};
      for (const source of sources) {
        if (!source)
          continue;
        for (const key in source) {
          const value = source[key];
          if (value === void 0)
            continue;
          if (Array.isArray(value)) {
            result[key] = value;
          } else if (isArrayBufferLike(value)) {
            result[key] = value;
          } else if (isObject2(value)) {
            const existing = result[key];
            if (isObject2(existing)) {
              result[key] = deepMerge(existing, value);
            } else {
              result[key] = deepMerge(value);
            }
          } else {
            result[key] = value;
          }
        }
      }
      return result;
    }
    function mergeCredentialCreationOptions(baseOptions, overrides) {
      return deepMerge(exports.DEFAULT_CREATION_OPTIONS, baseOptions, overrides || {});
    }
    function mergeCredentialRequestOptions(baseOptions, overrides) {
      return deepMerge(exports.DEFAULT_REQUEST_OPTIONS, baseOptions, overrides || {});
    }
    var WebAuthnApi = class {
      constructor(client) {
        this.client = client;
        this.enroll = this._enroll.bind(this);
        this.challenge = this._challenge.bind(this);
        this.verify = this._verify.bind(this);
        this.authenticate = this._authenticate.bind(this);
        this.register = this._register.bind(this);
      }
      /**
       * Enroll a new WebAuthn factor.
       * Creates an unverified WebAuthn factor that must be verified with a credential.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Omit<MFAEnrollWebauthnParams, 'factorType'>} params - Enrollment parameters (friendlyName required)
       * @returns {Promise<AuthMFAEnrollWebauthnResponse>} Enrolled factor details or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registering a New Credential}
       */
      async _enroll(params) {
        return this.client.mfa.enroll(Object.assign(Object.assign({}, params), { factorType: "webauthn" }));
      }
      /**
       * Challenge for WebAuthn credential creation or authentication.
       * Combines server challenge with browser credential operations.
       * Handles both registration (create) and authentication (request) flows.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {MFAChallengeWebauthnParams & { friendlyName?: string; signal?: AbortSignal }} params - Challenge parameters including factorId
       * @param {Object} overrides - Allows you to override the parameters passed to navigator.credentials
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides.create - Override options for credential creation
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides.request - Override options for credential request
       * @returns {Promise<RequestResult>} Challenge response with credential or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-credential-creation W3C WebAuthn Spec - Credential Creation}
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying Assertion}
       */
      async _challenge({ factorId, webauthn, friendlyName, signal }, overrides) {
        var _a;
        try {
          const { data: challengeResponse, error: challengeError } = await this.client.mfa.challenge({
            factorId,
            webauthn
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const abortSignal = signal !== null && signal !== void 0 ? signal : exports.webAuthnAbortService.createNewAbortSignal();
          if (challengeResponse.webauthn.type === "create") {
            const { user } = challengeResponse.webauthn.credential_options.publicKey;
            if (!user.name) {
              const nameToUse = friendlyName;
              if (!nameToUse) {
                const currentUser = await this.client.getUser();
                const userData = currentUser.data.user;
                const fallbackName = ((_a = userData === null || userData === void 0 ? void 0 : userData.user_metadata) === null || _a === void 0 ? void 0 : _a.name) || (userData === null || userData === void 0 ? void 0 : userData.email) || (userData === null || userData === void 0 ? void 0 : userData.id) || "User";
                user.name = `${user.id}:${fallbackName}`;
              } else {
                user.name = `${user.id}:${nameToUse}`;
              }
            }
            if (!user.displayName) {
              user.displayName = user.name;
            }
          }
          switch (challengeResponse.webauthn.type) {
            case "create": {
              const options = mergeCredentialCreationOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.create);
              const { data, error } = await createCredential({
                publicKey: options,
                signal: abortSignal
              });
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
            case "request": {
              const options = mergeCredentialRequestOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.request);
              const { data, error } = await getCredential(Object.assign(Object.assign({}, challengeResponse.webauthn.credential_options), { publicKey: options, signal: abortSignal }));
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
          }
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in challenge", error)
          };
        }
      }
      /**
       * Verify a WebAuthn credential with the server.
       * Completes the WebAuthn ceremony by sending the credential to the server for verification.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Verification parameters
       * @param {string} params.challengeId - ID of the challenge being verified
       * @param {string} params.factorId - ID of the WebAuthn factor
       * @param {MFAVerifyWebauthnParams<T>['webauthn']} params.webauthn - WebAuthn credential response
       * @returns {Promise<AuthMFAVerifyResponse>} Verification result with session or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying an Authentication Assertion}
       * */
      async _verify({ challengeId, factorId, webauthn }) {
        return this.client.mfa.verify({
          factorId,
          challengeId,
          webauthn
        });
      }
      /**
       * Complete WebAuthn authentication flow.
       * Performs challenge and verification in a single operation for existing credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Authentication parameters
       * @param {string} params.factorId - ID of the WebAuthn factor to authenticate with
       * @param {Object} params.webauthn - WebAuthn configuration
       * @param {string} params.webauthn.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.webauthn.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.webauthn.signal - Optional abort signal
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides - Override options for navigator.credentials.get
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Authentication result
       * @see {@link https://w3c.github.io/webauthn/#sctn-authentication W3C WebAuthn Spec - Authentication Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions MDN - PublicKeyCredentialRequestOptions}
       */
      async _authenticate({ factorId, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new errors_1.AuthError("rpId is required for WebAuthn authentication")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new errors_1.AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: challengeResponse, error: challengeError } = await this.challenge({
            factorId,
            webauthn: { rpId, rpOrigins },
            signal
          }, { request: overrides });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const { webauthn } = challengeResponse;
          return this._verify({
            factorId,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              type: webauthn.type,
              rpId,
              rpOrigins,
              credential_response: webauthn.credential_response
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in authenticate", error)
          };
        }
      }
      /**
       * Complete WebAuthn registration flow.
       * Performs enrollment, challenge, and verification in a single operation for new credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Registration parameters
       * @param {string} params.friendlyName - User-friendly name for the credential
       * @param {string} params.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.signal - Optional abort signal
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides - Override options for navigator.credentials.create
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Registration result
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registration Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions MDN - PublicKeyCredentialCreationOptions}
       */
      async _register({ friendlyName, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new errors_1.AuthError("rpId is required for WebAuthn registration")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new errors_1.AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: factor, error: enrollError } = await this._enroll({
            friendlyName
          });
          if (!factor) {
            await this.client.mfa.listFactors().then((factors) => {
              var _a;
              return (_a = factors.data) === null || _a === void 0 ? void 0 : _a.all.find((v) => v.factor_type === "webauthn" && v.friendly_name === friendlyName && v.status !== "unverified");
            }).then((factor2) => factor2 ? this.client.mfa.unenroll({ factorId: factor2 === null || factor2 === void 0 ? void 0 : factor2.id }) : void 0);
            return { data: null, error: enrollError };
          }
          const { data: challengeResponse, error: challengeError } = await this._challenge({
            factorId: factor.id,
            friendlyName: factor.friendly_name,
            webauthn: { rpId, rpOrigins },
            signal
          }, {
            create: overrides
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          return this._verify({
            factorId: factor.id,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              rpId,
              rpOrigins,
              type: challengeResponse.webauthn.type,
              credential_response: challengeResponse.webauthn.credential_response
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in register", error)
          };
        }
      }
    };
    exports.WebAuthnApi = WebAuthnApi;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/GoTrueClient.js
var require_GoTrueClient = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/GoTrueClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    var constants_1 = require_constants2();
    var errors_1 = require_errors();
    var fetch_1 = require_fetch();
    var helpers_1 = require_helpers();
    var local_storage_1 = require_local_storage();
    var locks_1 = require_locks();
    var polyfills_1 = require_polyfills();
    var version_1 = require_version2();
    var base64url_1 = require_base64url();
    var ethereum_1 = require_ethereum();
    var webauthn_1 = require_webauthn();
    (0, polyfills_1.polyfillGlobalThis)();
    var DEFAULT_OPTIONS = {
      url: constants_1.GOTRUE_URL,
      storageKey: constants_1.STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      headers: constants_1.DEFAULT_HEADERS,
      flowType: "implicit",
      debug: false,
      hasCustomAuthorizationHeader: false,
      throwOnError: false,
      lockAcquireTimeout: 5e3,
      // 5 seconds
      skipAutoInitialize: false
    };
    async function lockNoOp(name, acquireTimeout, fn) {
      return await fn();
    }
    var GLOBAL_JWKS = {};
    var GoTrueClient = class _GoTrueClient {
      /**
       * The JWKS used for verifying asymmetric JWTs
       */
      get jwks() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.jwks) !== null && _b !== void 0 ? _b : { keys: [] };
      }
      set jwks(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { jwks: value });
      }
      get jwks_cached_at() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.cachedAt) !== null && _b !== void 0 ? _b : Number.MIN_SAFE_INTEGER;
      }
      set jwks_cached_at(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { cachedAt: value });
      }
      /**
       * Create a new client for use in the browser.
       *
       * @example
       * ```ts
       * import { GoTrueClient } from '@supabase/auth-js'
       *
       * const auth = new GoTrueClient({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { apikey: 'public-anon-key' },
       *   storageKey: 'supabase-auth',
       * })
       * ```
       */
      constructor(options) {
        var _a, _b, _c;
        this.userStorage = null;
        this.memoryStorage = null;
        this.stateChangeEmitters = /* @__PURE__ */ new Map();
        this.autoRefreshTicker = null;
        this.autoRefreshTickTimeout = null;
        this.visibilityChangedCallback = null;
        this.refreshingDeferred = null;
        this.initializePromise = null;
        this.detectSessionInUrl = true;
        this.hasCustomAuthorizationHeader = false;
        this.suppressGetSessionWarning = false;
        this.lockAcquired = false;
        this.pendingInLock = [];
        this.broadcastChannel = null;
        this.logger = console.log;
        const settings = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
        this.storageKey = settings.storageKey;
        this.instanceID = (_a = _GoTrueClient.nextInstanceID[this.storageKey]) !== null && _a !== void 0 ? _a : 0;
        _GoTrueClient.nextInstanceID[this.storageKey] = this.instanceID + 1;
        this.logDebugMessages = !!settings.debug;
        if (typeof settings.debug === "function") {
          this.logger = settings.debug;
        }
        if (this.instanceID > 0 && (0, helpers_1.isBrowser)()) {
          const message = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
          console.warn(message);
          if (this.logDebugMessages) {
            console.trace(message);
          }
        }
        this.persistSession = settings.persistSession;
        this.autoRefreshToken = settings.autoRefreshToken;
        this.admin = new GoTrueAdminApi_1.default({
          url: settings.url,
          headers: settings.headers,
          fetch: settings.fetch
        });
        this.url = settings.url;
        this.headers = settings.headers;
        this.fetch = (0, helpers_1.resolveFetch)(settings.fetch);
        this.lock = settings.lock || lockNoOp;
        this.detectSessionInUrl = settings.detectSessionInUrl;
        this.flowType = settings.flowType;
        this.hasCustomAuthorizationHeader = settings.hasCustomAuthorizationHeader;
        this.throwOnError = settings.throwOnError;
        this.lockAcquireTimeout = settings.lockAcquireTimeout;
        if (settings.lock) {
          this.lock = settings.lock;
        } else if (this.persistSession && (0, helpers_1.isBrowser)() && ((_b = globalThis === null || globalThis === void 0 ? void 0 : globalThis.navigator) === null || _b === void 0 ? void 0 : _b.locks)) {
          this.lock = locks_1.navigatorLock;
        } else {
          this.lock = lockNoOp;
        }
        if (!this.jwks) {
          this.jwks = { keys: [] };
          this.jwks_cached_at = Number.MIN_SAFE_INTEGER;
        }
        this.mfa = {
          verify: this._verify.bind(this),
          enroll: this._enroll.bind(this),
          unenroll: this._unenroll.bind(this),
          challenge: this._challenge.bind(this),
          listFactors: this._listFactors.bind(this),
          challengeAndVerify: this._challengeAndVerify.bind(this),
          getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this),
          webauthn: new webauthn_1.WebAuthnApi(this)
        };
        this.oauth = {
          getAuthorizationDetails: this._getAuthorizationDetails.bind(this),
          approveAuthorization: this._approveAuthorization.bind(this),
          denyAuthorization: this._denyAuthorization.bind(this),
          listGrants: this._listOAuthGrants.bind(this),
          revokeGrant: this._revokeOAuthGrant.bind(this)
        };
        if (this.persistSession) {
          if (settings.storage) {
            this.storage = settings.storage;
          } else {
            if ((0, helpers_1.supportsLocalStorage)()) {
              this.storage = globalThis.localStorage;
            } else {
              this.memoryStorage = {};
              this.storage = (0, local_storage_1.memoryLocalStorageAdapter)(this.memoryStorage);
            }
          }
          if (settings.userStorage) {
            this.userStorage = settings.userStorage;
          }
        } else {
          this.memoryStorage = {};
          this.storage = (0, local_storage_1.memoryLocalStorageAdapter)(this.memoryStorage);
        }
        if ((0, helpers_1.isBrowser)() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
          try {
            this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
          } catch (e) {
            console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", e);
          }
          (_c = this.broadcastChannel) === null || _c === void 0 ? void 0 : _c.addEventListener("message", async (event) => {
            this._debug("received broadcast notification from other tab or client", event);
            try {
              await this._notifyAllSubscribers(event.data.event, event.data.session, false);
            } catch (error) {
              this._debug("#broadcastChannel", "error", error);
            }
          });
        }
        if (!settings.skipAutoInitialize) {
          this.initialize().catch((error) => {
            this._debug("#initialize()", "error", error);
          });
        }
      }
      /**
       * Returns whether error throwing mode is enabled for this client.
       */
      isThrowOnErrorEnabled() {
        return this.throwOnError;
      }
      /**
       * Centralizes return handling with optional error throwing. When `throwOnError` is enabled
       * and the provided result contains a non-nullish error, the error is thrown instead of
       * being returned. This ensures consistent behavior across all public API methods.
       */
      _returnResult(result) {
        if (this.throwOnError && result && result.error) {
          throw result.error;
        }
        return result;
      }
      _logPrefix() {
        return `GoTrueClient@${this.storageKey}:${this.instanceID} (${version_1.version}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
      }
      _debug(...args) {
        if (this.logDebugMessages) {
          this.logger(this._logPrefix(), ...args);
        }
        return this;
      }
      /**
       * Initializes the client session either from the url or from storage.
       * This method is automatically called when instantiating the client, but should also be called
       * manually when checking for an error from an auth redirect (oauth, magiclink, password recovery, etc).
       */
      async initialize() {
        if (this.initializePromise) {
          return await this.initializePromise;
        }
        this.initializePromise = (async () => {
          return await this._acquireLock(this.lockAcquireTimeout, async () => {
            return await this._initialize();
          });
        })();
        return await this.initializePromise;
      }
      /**
       * IMPORTANT:
       * 1. Never throw in this method, as it is called from the constructor
       * 2. Never return a session from this method as it would be cached over
       *    the whole lifetime of the client
       */
      async _initialize() {
        var _a;
        try {
          let params = {};
          let callbackUrlType = "none";
          if ((0, helpers_1.isBrowser)()) {
            params = (0, helpers_1.parseParametersFromURL)(window.location.href);
            if (this._isImplicitGrantCallback(params)) {
              callbackUrlType = "implicit";
            } else if (await this._isPKCECallback(params)) {
              callbackUrlType = "pkce";
            }
          }
          if ((0, helpers_1.isBrowser)() && this.detectSessionInUrl && callbackUrlType !== "none") {
            const { data, error } = await this._getSessionFromURL(params, callbackUrlType);
            if (error) {
              this._debug("#_initialize()", "error detecting session from URL", error);
              if ((0, errors_1.isAuthImplicitGrantRedirectError)(error)) {
                const errorCode = (_a = error.details) === null || _a === void 0 ? void 0 : _a.code;
                if (errorCode === "identity_already_exists" || errorCode === "identity_not_found" || errorCode === "single_identity_not_deletable") {
                  return { error };
                }
              }
              return { error };
            }
            const { session, redirectType } = data;
            this._debug("#_initialize()", "detected session in URL", session, "redirect type", redirectType);
            await this._saveSession(session);
            setTimeout(async () => {
              if (redirectType === "recovery") {
                await this._notifyAllSubscribers("PASSWORD_RECOVERY", session);
              } else {
                await this._notifyAllSubscribers("SIGNED_IN", session);
              }
            }, 0);
            return { error: null };
          }
          await this._recoverAndRefresh();
          return { error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ error });
          }
          return this._returnResult({
            error: new errors_1.AuthUnknownError("Unexpected error during initialization", error)
          });
        } finally {
          await this._handleVisibilityChange();
          this._debug("#_initialize()", "end");
        }
      }
      /**
       * Creates a new anonymous user.
       *
       * @returns A session where the is_anonymous claim in the access token JWT set to true
       */
      async signInAnonymously(credentials) {
        var _a, _b, _c;
        try {
          const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
            headers: this.headers,
            body: {
              data: (_b = (_a = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : {},
              gotrue_meta_security: { captcha_token: (_c = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _c === void 0 ? void 0 : _c.captchaToken }
            },
            xform: fetch_1._sessionResponse
          });
          const { data, error } = res;
          if (error || !data) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Creates a new user.
       *
       * Be aware that if a user account exists in the system you may get back an
       * error message that attempts to hide this information from the user.
       * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
       *
       * @returns A logged-in session if the server has "autoconfirm" ON
       * @returns A user if the server has "autoconfirm" OFF
       */
      async signUp(credentials) {
        var _a, _b, _c;
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: {
                email,
                password,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              xform: fetch_1._sessionResponse
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              body: {
                phone,
                password,
                data: (_b = options === null || options === void 0 ? void 0 : options.data) !== null && _b !== void 0 ? _b : {},
                channel: (_c = options === null || options === void 0 ? void 0 : options.channel) !== null && _c !== void 0 ? _c : "sms",
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponse
            });
          } else {
            throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error || !data) {
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user with an email and password or phone and password.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or that the
       * email/phone and password combination is wrong or that the account can only
       * be accessed via social login.
       */
      async signInWithPassword(credentials) {
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                email,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponsePassword
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                phone,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponsePassword
            });
          } else {
            throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({
            data: Object.assign({ user: data.user, session: data.session }, data.weak_password ? { weakPassword: data.weak_password } : null),
            error
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user via a third-party provider.
       * This method supports the PKCE flow.
       */
      async signInWithOAuth(credentials) {
        var _a, _b, _c, _d;
        return await this._handleProviderSignIn(credentials.provider, {
          redirectTo: (_a = credentials.options) === null || _a === void 0 ? void 0 : _a.redirectTo,
          scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
          queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
          skipBrowserRedirect: (_d = credentials.options) === null || _d === void 0 ? void 0 : _d.skipBrowserRedirect
        });
      }
      /**
       * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
       */
      async exchangeCodeForSession(authCode) {
        await this.initializePromise;
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._exchangeCodeForSession(authCode);
        });
      }
      /**
       * Signs in a user by verifying a message signed by the user's private key.
       * Supports Ethereum (via Sign-In-With-Ethereum) & Solana (Sign-In-With-Solana) standards,
       * both of which derive from the EIP-4361 standard
       * With slight variation on Solana's side.
       * @reference https://eips.ethereum.org/EIPS/eip-4361
       */
      async signInWithWeb3(credentials) {
        const { chain } = credentials;
        switch (chain) {
          case "ethereum":
            return await this.signInWithEthereum(credentials);
          case "solana":
            return await this.signInWithSolana(credentials);
          default:
            throw new Error(`@supabase/auth-js: Unsupported chain "${chain}"`);
        }
      }
      async signInWithEthereum(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!(0, helpers_1.isBrowser)()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("ethereum" in windowAny && typeof windowAny.ethereum === "object" && "request" in windowAny.ethereum && typeof windowAny.ethereum.request === "function") {
              resolvedWallet = windowAny.ethereum;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          const accounts = await resolvedWallet.request({
            method: "eth_requestAccounts"
          }).then((accs) => accs).catch(() => {
            throw new Error(`@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid`);
          });
          if (!accounts || accounts.length === 0) {
            throw new Error(`@supabase/auth-js: No accounts available. Please ensure the wallet is connected.`);
          }
          const address = (0, ethereum_1.getAddress)(accounts[0]);
          let chainId = (_b = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _b === void 0 ? void 0 : _b.chainId;
          if (!chainId) {
            const chainIdHex = await resolvedWallet.request({
              method: "eth_chainId"
            });
            chainId = (0, ethereum_1.fromHex)(chainIdHex);
          }
          const siweMessage = {
            domain: url.host,
            address,
            statement,
            uri: url.href,
            version: "1",
            chainId,
            nonce: (_c = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _c === void 0 ? void 0 : _c.nonce,
            issuedAt: (_e = (_d = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _d === void 0 ? void 0 : _d.issuedAt) !== null && _e !== void 0 ? _e : /* @__PURE__ */ new Date(),
            expirationTime: (_f = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _f === void 0 ? void 0 : _f.expirationTime,
            notBefore: (_g = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _g === void 0 ? void 0 : _g.notBefore,
            requestId: (_h = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _h === void 0 ? void 0 : _h.requestId,
            resources: (_j = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _j === void 0 ? void 0 : _j.resources
          };
          message = (0, ethereum_1.createSiweMessage)(siweMessage);
          signature = await resolvedWallet.request({
            method: "personal_sign",
            params: [(0, ethereum_1.toHex)(message), address]
          });
        }
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({
              chain: "ethereum",
              message,
              signature
            }, ((_k = credentials.options) === null || _k === void 0 ? void 0 : _k.captchaToken) ? { gotrue_meta_security: { captcha_token: (_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken } } : null),
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async signInWithSolana(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!(0, helpers_1.isBrowser)()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("solana" in windowAny && typeof windowAny.solana === "object" && ("signIn" in windowAny.solana && typeof windowAny.solana.signIn === "function" || "signMessage" in windowAny.solana && typeof windowAny.solana.signMessage === "function")) {
              resolvedWallet = windowAny.solana;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          if ("signIn" in resolvedWallet && resolvedWallet.signIn) {
            const output = await resolvedWallet.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, options === null || options === void 0 ? void 0 : options.signInWithSolana), {
              // non-overridable properties
              version: "1",
              domain: url.host,
              uri: url.href
            }), statement ? { statement } : null));
            let outputToProcess;
            if (Array.isArray(output) && output[0] && typeof output[0] === "object") {
              outputToProcess = output[0];
            } else if (output && typeof output === "object" && "signedMessage" in output && "signature" in output) {
              outputToProcess = output;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
            }
            if ("signedMessage" in outputToProcess && "signature" in outputToProcess && (typeof outputToProcess.signedMessage === "string" || outputToProcess.signedMessage instanceof Uint8Array) && outputToProcess.signature instanceof Uint8Array) {
              message = typeof outputToProcess.signedMessage === "string" ? outputToProcess.signedMessage : new TextDecoder().decode(outputToProcess.signedMessage);
              signature = outputToProcess.signature;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
            }
          } else {
            if (!("signMessage" in resolvedWallet) || typeof resolvedWallet.signMessage !== "function" || !("publicKey" in resolvedWallet) || typeof resolvedWallet !== "object" || !resolvedWallet.publicKey || !("toBase58" in resolvedWallet.publicKey) || typeof resolvedWallet.publicKey.toBase58 !== "function") {
              throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
            }
            message = [
              `${url.host} wants you to sign in with your Solana account:`,
              resolvedWallet.publicKey.toBase58(),
              ...statement ? ["", statement, ""] : [""],
              "Version: 1",
              `URI: ${url.href}`,
              `Issued At: ${(_c = (_b = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _b === void 0 ? void 0 : _b.issuedAt) !== null && _c !== void 0 ? _c : (/* @__PURE__ */ new Date()).toISOString()}`,
              ...((_d = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _d === void 0 ? void 0 : _d.notBefore) ? [`Not Before: ${options.signInWithSolana.notBefore}`] : [],
              ...((_e = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _e === void 0 ? void 0 : _e.expirationTime) ? [`Expiration Time: ${options.signInWithSolana.expirationTime}`] : [],
              ...((_f = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _f === void 0 ? void 0 : _f.chainId) ? [`Chain ID: ${options.signInWithSolana.chainId}`] : [],
              ...((_g = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _g === void 0 ? void 0 : _g.nonce) ? [`Nonce: ${options.signInWithSolana.nonce}`] : [],
              ...((_h = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _h === void 0 ? void 0 : _h.requestId) ? [`Request ID: ${options.signInWithSolana.requestId}`] : [],
              ...((_k = (_j = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _j === void 0 ? void 0 : _j.resources) === null || _k === void 0 ? void 0 : _k.length) ? [
                "Resources",
                ...options.signInWithSolana.resources.map((resource) => `- ${resource}`)
              ] : []
            ].join("\n");
            const maybeSignature = await resolvedWallet.signMessage(new TextEncoder().encode(message), "utf8");
            if (!maybeSignature || !(maybeSignature instanceof Uint8Array)) {
              throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
            }
            signature = maybeSignature;
          }
        }
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({ chain: "solana", message, signature: (0, base64url_1.bytesToBase64URL)(signature) }, ((_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken) ? { gotrue_meta_security: { captcha_token: (_m = credentials.options) === null || _m === void 0 ? void 0 : _m.captchaToken } } : null),
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async _exchangeCodeForSession(authCode) {
        const storageItem = await (0, helpers_1.getItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        const [codeVerifier, redirectType] = (storageItem !== null && storageItem !== void 0 ? storageItem : "").split("/");
        try {
          if (!codeVerifier && this.flowType === "pkce") {
            throw new errors_1.AuthPKCECodeVerifierMissingError();
          }
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, {
            headers: this.headers,
            body: {
              auth_code: authCode,
              code_verifier: codeVerifier
            },
            xform: fetch_1._sessionResponse
          });
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error: invalidTokenError
            });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign(Object.assign({}, data), { redirectType: redirectType !== null && redirectType !== void 0 ? redirectType : null }), error });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error
            });
          }
          throw error;
        }
      }
      /**
       * Allows signing in with an OIDC ID token. The authentication provider used
       * should be enabled and configured.
       */
      async signInWithIdToken(credentials) {
        try {
          const { options, provider, token, access_token, nonce } = credentials;
          const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
            headers: this.headers,
            body: {
              provider,
              id_token: token,
              access_token,
              nonce,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            xform: fetch_1._sessionResponse
          });
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data, error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user using magiclink or a one-time password (OTP).
       *
       * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
       * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
       * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or, that the account
       * can only be accessed via social login.
       *
       * Do note that you will need to configure a Whatsapp sender on Twilio
       * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
       * channel is not supported on other providers
       * at this time.
       * This method supports PKCE when an email is passed.
       */
      async signInWithOtp(credentials) {
        var _a, _b, _c, _d, _e;
        try {
          if ("email" in credentials) {
            const { email, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            const { error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                email,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                create_user: (_b = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _b !== void 0 ? _b : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          if ("phone" in credentials) {
            const { phone, options } = credentials;
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                phone,
                data: (_c = options === null || options === void 0 ? void 0 : options.data) !== null && _c !== void 0 ? _c : {},
                create_user: (_d = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _d !== void 0 ? _d : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                channel: (_e = options === null || options === void 0 ? void 0 : options.channel) !== null && _e !== void 0 ? _e : "sms"
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number.");
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
       */
      async verifyOtp(params) {
        var _a, _b;
        try {
          let redirectTo = void 0;
          let captchaToken = void 0;
          if ("options" in params) {
            redirectTo = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo;
            captchaToken = (_b = params.options) === null || _b === void 0 ? void 0 : _b.captchaToken;
          }
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/verify`, {
            headers: this.headers,
            body: Object.assign(Object.assign({}, params), { gotrue_meta_security: { captcha_token: captchaToken } }),
            redirectTo,
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data) {
            const tokenVerificationError = new Error("An error occurred on token verification.");
            throw tokenVerificationError;
          }
          const session = data.session;
          const user = data.user;
          if (session === null || session === void 0 ? void 0 : session.access_token) {
            await this._saveSession(session);
            await this._notifyAllSubscribers(params.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Attempts a single-sign on using an enterprise Identity Provider. A
       * successful SSO attempt will redirect the current page to the identity
       * provider authorization page. The redirect URL is implementation and SSO
       * protocol specific.
       *
       * You can use it by providing a SSO domain. Typically you can extract this
       * domain by asking users for their email address. If this domain is
       * registered on the Auth instance the redirect will use that organization's
       * currently active SSO Identity Provider for the login.
       *
       * If you have built an organization-specific login page, you can use the
       * organization's SSO Identity Provider UUID directly instead.
       */
      async signInWithSSO(params) {
        var _a, _b, _c, _d, _e;
        try {
          let codeChallenge = null;
          let codeChallengeMethod = null;
          if (this.flowType === "pkce") {
            ;
            [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
          }
          const result = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/sso`, {
            body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in params ? { provider_id: params.providerId } : null), "domain" in params ? { domain: params.domain } : null), { redirect_to: (_b = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo) !== null && _b !== void 0 ? _b : void 0 }), ((_c = params === null || params === void 0 ? void 0 : params.options) === null || _c === void 0 ? void 0 : _c.captchaToken) ? { gotrue_meta_security: { captcha_token: params.options.captchaToken } } : null), { skip_http_redirect: true, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
            headers: this.headers,
            xform: fetch_1._ssoResponse
          });
          if (((_d = result.data) === null || _d === void 0 ? void 0 : _d.url) && (0, helpers_1.isBrowser)() && !((_e = params.options) === null || _e === void 0 ? void 0 : _e.skipBrowserRedirect)) {
            window.location.assign(result.data.url);
          }
          return this._returnResult(result);
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Sends a reauthentication OTP to the user's email or phone number.
       * Requires the user to be signed-in.
       */
      async reauthenticate() {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._reauthenticate();
        });
      }
      async _reauthenticate() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError)
              throw sessionError;
            if (!session)
              throw new errors_1.AuthSessionMissingError();
            const { error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/reauthenticate`, {
              headers: this.headers,
              jwt: session.access_token
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
       */
      async resend(credentials) {
        try {
          const endpoint = `${this.url}/resend`;
          if ("email" in credentials) {
            const { email, type, options } = credentials;
            const { error } = await (0, fetch_1._request)(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                email,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if ("phone" in credentials) {
            const { phone, type, options } = credentials;
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                phone,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a type");
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns the session, refreshing it if necessary.
       *
       * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
       *
       * **IMPORTANT:** This method loads values directly from the storage attached
       * to the client. If that storage is based on request cookies for example,
       * the values in it may not be authentic and therefore it's strongly advised
       * against using this method and its results in such circumstances. A warning
       * will be emitted if this is detected. Use {@link #getUser()} instead.
       */
      async getSession() {
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._useSession(async (result2) => {
            return result2;
          });
        });
        return result;
      }
      /**
       * Acquires a global lock based on the storage key.
       */
      async _acquireLock(acquireTimeout, fn) {
        this._debug("#_acquireLock", "begin", acquireTimeout);
        try {
          if (this.lockAcquired) {
            const last = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve();
            const result = (async () => {
              await last;
              return await fn();
            })();
            this.pendingInLock.push((async () => {
              try {
                await result;
              } catch (e) {
              }
            })());
            return result;
          }
          return await this.lock(`lock:${this.storageKey}`, acquireTimeout, async () => {
            this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
            try {
              this.lockAcquired = true;
              const result = fn();
              this.pendingInLock.push((async () => {
                try {
                  await result;
                } catch (e) {
                }
              })());
              await result;
              while (this.pendingInLock.length) {
                const waitOn = [...this.pendingInLock];
                await Promise.all(waitOn);
                this.pendingInLock.splice(0, waitOn.length);
              }
              return await result;
            } finally {
              this._debug("#_acquireLock", "lock released for storage key", this.storageKey);
              this.lockAcquired = false;
            }
          });
        } finally {
          this._debug("#_acquireLock", "end");
        }
      }
      /**
       * Use instead of {@link #getSession} inside the library. It is
       * semantically usually what you want, as getting a session involves some
       * processing afterwards that requires only one client operating on the
       * session at once across multiple tabs or processes.
       */
      async _useSession(fn) {
        this._debug("#_useSession", "begin");
        try {
          const result = await this.__loadSession();
          return await fn(result);
        } finally {
          this._debug("#_useSession", "end");
        }
      }
      /**
       * NEVER USE DIRECTLY!
       *
       * Always use {@link #_useSession}.
       */
      async __loadSession() {
        this._debug("#__loadSession()", "begin");
        if (!this.lockAcquired) {
          this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
        }
        try {
          let currentSession = null;
          const maybeSession = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey);
          this._debug("#getSession()", "session from storage", maybeSession);
          if (maybeSession !== null) {
            if (this._isValidSession(maybeSession)) {
              currentSession = maybeSession;
            } else {
              this._debug("#getSession()", "session from storage is not valid");
              await this._removeSession();
            }
          }
          if (!currentSession) {
            return { data: { session: null }, error: null };
          }
          const hasExpired = currentSession.expires_at ? currentSession.expires_at * 1e3 - Date.now() < constants_1.EXPIRY_MARGIN_MS : false;
          this._debug("#__loadSession()", `session has${hasExpired ? "" : " not"} expired`, "expires_at", currentSession.expires_at);
          if (!hasExpired) {
            if (this.userStorage) {
              const maybeUser = await (0, helpers_1.getItemAsync)(this.userStorage, this.storageKey + "-user");
              if (maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) {
                currentSession.user = maybeUser.user;
              } else {
                currentSession.user = (0, helpers_1.userNotAvailableProxy)();
              }
            }
            if (this.storage.isServer && currentSession.user && !currentSession.user.__isUserNotAvailableProxy) {
              const suppressWarningRef = { value: this.suppressGetSessionWarning };
              currentSession.user = (0, helpers_1.insecureUserWarningProxy)(currentSession.user, suppressWarningRef);
              if (suppressWarningRef.value) {
                this.suppressGetSessionWarning = true;
              }
            }
            return { data: { session: currentSession }, error: null };
          }
          const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
          if (error) {
            return this._returnResult({ data: { session: null }, error });
          }
          return this._returnResult({ data: { session }, error: null });
        } finally {
          this._debug("#__loadSession()", "end");
        }
      }
      /**
       * Gets the current user details if there is an existing session. This method
       * performs a network request to the Supabase Auth server, so the returned
       * value is authentic and can be used to base authorization rules on.
       *
       * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
       */
      async getUser(jwt) {
        if (jwt) {
          return await this._getUser(jwt);
        }
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._getUser();
        });
        if (result.data.user) {
          this.suppressGetSessionWarning = true;
        }
        return result;
      }
      async _getUser(jwt) {
        try {
          if (jwt) {
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt,
              xform: fetch_1._userResponse
            });
          }
          return await this._useSession(async (result) => {
            var _a, _b, _c;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            if (!((_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) && !this.hasCustomAuthorizationHeader) {
              return { data: { user: null }, error: new errors_1.AuthSessionMissingError() };
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt: (_c = (_b = data.session) === null || _b === void 0 ? void 0 : _b.access_token) !== null && _c !== void 0 ? _c : void 0,
              xform: fetch_1._userResponse
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            if ((0, errors_1.isAuthSessionMissingError)(error)) {
              await this._removeSession();
              await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            }
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Updates user data for a logged in user.
       */
      async updateUser(attributes, options = {}) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._updateUser(attributes, options);
        });
      }
      async _updateUser(attributes, options = {}) {
        try {
          return await this._useSession(async (result) => {
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              throw sessionError;
            }
            if (!sessionData.session) {
              throw new errors_1.AuthSessionMissingError();
            }
            const session = sessionData.session;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce" && attributes.email != null) {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            const { data, error: userError } = await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/user`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: Object.assign(Object.assign({}, attributes), { code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
              jwt: session.access_token,
              xform: fetch_1._userResponse
            });
            if (userError) {
              throw userError;
            }
            session.user = data.user;
            await this._saveSession(session);
            await this._notifyAllSubscribers("USER_UPDATED", session);
            return this._returnResult({ data: { user: session.user }, error: null });
          });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
       * If the refresh token or access token in the current session is invalid, an error will be thrown.
       * @param currentSession The current session that minimally contains an access token and refresh token.
       */
      async setSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._setSession(currentSession);
        });
      }
      async _setSession(currentSession) {
        try {
          if (!currentSession.access_token || !currentSession.refresh_token) {
            throw new errors_1.AuthSessionMissingError();
          }
          const timeNow = Date.now() / 1e3;
          let expiresAt = timeNow;
          let hasExpired = true;
          let session = null;
          const { payload } = (0, helpers_1.decodeJWT)(currentSession.access_token);
          if (payload.exp) {
            expiresAt = payload.exp;
            hasExpired = expiresAt <= timeNow;
          }
          if (hasExpired) {
            const { data: refreshedSession, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!refreshedSession) {
              return { data: { user: null, session: null }, error: null };
            }
            session = refreshedSession;
          } else {
            const { data, error } = await this._getUser(currentSession.access_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            session = {
              access_token: currentSession.access_token,
              refresh_token: currentSession.refresh_token,
              user: data.user,
              token_type: "bearer",
              expires_in: expiresAt - timeNow,
              expires_at: expiresAt
            };
            await this._saveSession(session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user: session.user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns a new session, regardless of expiry status.
       * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
       * If the current session's refresh token is invalid, an error will be thrown.
       * @param currentSession The current session. If passed in, it must contain a refresh token.
       */
      async refreshSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._refreshSession(currentSession);
        });
      }
      async _refreshSession(currentSession) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            if (!currentSession) {
              const { data, error: error2 } = result;
              if (error2) {
                throw error2;
              }
              currentSession = (_a = data.session) !== null && _a !== void 0 ? _a : void 0;
            }
            if (!(currentSession === null || currentSession === void 0 ? void 0 : currentSession.refresh_token)) {
              throw new errors_1.AuthSessionMissingError();
            }
            const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!session) {
              return this._returnResult({ data: { user: null, session: null }, error: null });
            }
            return this._returnResult({ data: { user: session.user, session }, error: null });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Gets the session data from a URL string
       */
      async _getSessionFromURL(params, callbackUrlType) {
        try {
          if (!(0, helpers_1.isBrowser)())
            throw new errors_1.AuthImplicitGrantRedirectError("No browser detected.");
          if (params.error || params.error_description || params.error_code) {
            throw new errors_1.AuthImplicitGrantRedirectError(params.error_description || "Error in URL with unspecified error_description", {
              error: params.error || "unspecified_error",
              code: params.error_code || "unspecified_code"
            });
          }
          switch (callbackUrlType) {
            case "implicit":
              if (this.flowType === "pkce") {
                throw new errors_1.AuthPKCEGrantCodeExchangeError("Not a valid PKCE flow url.");
              }
              break;
            case "pkce":
              if (this.flowType === "implicit") {
                throw new errors_1.AuthImplicitGrantRedirectError("Not a valid implicit grant flow url.");
              }
              break;
            default:
          }
          if (callbackUrlType === "pkce") {
            this._debug("#_initialize()", "begin", "is PKCE flow", true);
            if (!params.code)
              throw new errors_1.AuthPKCEGrantCodeExchangeError("No code detected.");
            const { data: data2, error: error2 } = await this._exchangeCodeForSession(params.code);
            if (error2)
              throw error2;
            const url = new URL(window.location.href);
            url.searchParams.delete("code");
            window.history.replaceState(window.history.state, "", url.toString());
            return { data: { session: data2.session, redirectType: null }, error: null };
          }
          const { provider_token, provider_refresh_token, access_token, refresh_token, expires_in, expires_at, token_type } = params;
          if (!access_token || !expires_in || !refresh_token || !token_type) {
            throw new errors_1.AuthImplicitGrantRedirectError("No session defined in URL");
          }
          const timeNow = Math.round(Date.now() / 1e3);
          const expiresIn = parseInt(expires_in);
          let expiresAt = timeNow + expiresIn;
          if (expires_at) {
            expiresAt = parseInt(expires_at);
          }
          const actuallyExpiresIn = expiresAt - timeNow;
          if (actuallyExpiresIn * 1e3 <= constants_1.AUTO_REFRESH_TICK_DURATION_MS) {
            console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${actuallyExpiresIn}s, should have been closer to ${expiresIn}s`);
          }
          const issuedAt = expiresAt - expiresIn;
          if (timeNow - issuedAt >= 120) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", issuedAt, expiresAt, timeNow);
          } else if (timeNow - issuedAt < 0) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", issuedAt, expiresAt, timeNow);
          }
          const { data, error } = await this._getUser(access_token);
          if (error)
            throw error;
          const session = {
            provider_token,
            provider_refresh_token,
            access_token,
            expires_in: expiresIn,
            expires_at: expiresAt,
            refresh_token,
            token_type,
            user: data.user
          };
          window.location.hash = "";
          this._debug("#_getSessionFromURL()", "clearing window.location.hash");
          return this._returnResult({ data: { session, redirectType: params.type }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, redirectType: null }, error });
          }
          throw error;
        }
      }
      /**
       * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
       *
       * If `detectSessionInUrl` is a function, it will be called with the URL and params to determine
       * if the URL should be processed as a Supabase auth callback. This allows users to exclude
       * URLs from other OAuth providers (e.g., Facebook Login) that also return access_token in the fragment.
       */
      _isImplicitGrantCallback(params) {
        if (typeof this.detectSessionInUrl === "function") {
          return this.detectSessionInUrl(new URL(window.location.href), params);
        }
        return Boolean(params.access_token || params.error_description);
      }
      /**
       * Checks if the current URL and backing storage contain parameters given by a PKCE flow
       */
      async _isPKCECallback(params) {
        const currentStorageContent = await (0, helpers_1.getItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        return !!(params.code && currentStorageContent);
      }
      /**
       * Inside a browser context, `signOut()` will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
       *
       * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
       * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
       *
       * If using `others` scope, no `SIGNED_OUT` event is fired!
       */
      async signOut(options = { scope: "global" }) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._signOut(options);
        });
      }
      async _signOut({ scope } = { scope: "global" }) {
        return await this._useSession(async (result) => {
          var _a;
          const { data, error: sessionError } = result;
          if (sessionError && !(0, errors_1.isAuthSessionMissingError)(sessionError)) {
            return this._returnResult({ error: sessionError });
          }
          const accessToken = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token;
          if (accessToken) {
            const { error } = await this.admin.signOut(accessToken, scope);
            if (error) {
              if (!((0, errors_1.isAuthApiError)(error) && (error.status === 404 || error.status === 401 || error.status === 403) || (0, errors_1.isAuthSessionMissingError)(error))) {
                return this._returnResult({ error });
              }
            }
          }
          if (scope !== "others") {
            await this._removeSession();
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          }
          return this._returnResult({ error: null });
        });
      }
      onAuthStateChange(callback) {
        const id = (0, helpers_1.generateCallbackId)();
        const subscription = {
          id,
          callback,
          unsubscribe: () => {
            this._debug("#unsubscribe()", "state change callback with id removed", id);
            this.stateChangeEmitters.delete(id);
          }
        };
        this._debug("#onAuthStateChange()", "registered callback with id", id);
        this.stateChangeEmitters.set(id, subscription);
        (async () => {
          await this.initializePromise;
          await this._acquireLock(this.lockAcquireTimeout, async () => {
            this._emitInitialSession(id);
          });
        })();
        return { data: { subscription } };
      }
      async _emitInitialSession(id) {
        return await this._useSession(async (result) => {
          var _a, _b;
          try {
            const { data: { session }, error } = result;
            if (error)
              throw error;
            await ((_a = this.stateChangeEmitters.get(id)) === null || _a === void 0 ? void 0 : _a.callback("INITIAL_SESSION", session));
            this._debug("INITIAL_SESSION", "callback id", id, "session", session);
          } catch (err) {
            await ((_b = this.stateChangeEmitters.get(id)) === null || _b === void 0 ? void 0 : _b.callback("INITIAL_SESSION", null));
            this._debug("INITIAL_SESSION", "callback id", id, "error", err);
            console.error(err);
          }
        });
      }
      /**
       * Sends a password reset request to an email address. This method supports the PKCE flow.
       *
       * @param email The email address of the user.
       * @param options.redirectTo The URL to send the user to after they click the password reset link.
       * @param options.captchaToken Verification token received when the user completes the captcha on the site.
       */
      async resetPasswordForEmail(email, options = {}) {
        let codeChallenge = null;
        let codeChallengeMethod = null;
        if (this.flowType === "pkce") {
          ;
          [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(
            this.storage,
            this.storageKey,
            true
            // isPasswordRecovery
          );
        }
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/recover`, {
            body: {
              email,
              code_challenge: codeChallenge,
              code_challenge_method: codeChallengeMethod,
              gotrue_meta_security: { captcha_token: options.captchaToken }
            },
            headers: this.headers,
            redirectTo: options.redirectTo
          });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Gets all the identities linked to a user.
       */
      async getUserIdentities() {
        var _a;
        try {
          const { data, error } = await this.getUser();
          if (error)
            throw error;
          return this._returnResult({ data: { identities: (_a = data.user.identities) !== null && _a !== void 0 ? _a : [] }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async linkIdentity(credentials) {
        if ("token" in credentials) {
          return this.linkIdentityIdToken(credentials);
        }
        return this.linkIdentityOAuth(credentials);
      }
      async linkIdentityOAuth(credentials) {
        var _a;
        try {
          const { data, error } = await this._useSession(async (result) => {
            var _a2, _b, _c, _d, _e;
            const { data: data2, error: error2 } = result;
            if (error2)
              throw error2;
            const url = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, credentials.provider, {
              redirectTo: (_a2 = credentials.options) === null || _a2 === void 0 ? void 0 : _a2.redirectTo,
              scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
              queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
              skipBrowserRedirect: true
            });
            return await (0, fetch_1._request)(this.fetch, "GET", url, {
              headers: this.headers,
              jwt: (_e = (_d = data2.session) === null || _d === void 0 ? void 0 : _d.access_token) !== null && _e !== void 0 ? _e : void 0
            });
          });
          if (error)
            throw error;
          if ((0, helpers_1.isBrowser)() && !((_a = credentials.options) === null || _a === void 0 ? void 0 : _a.skipBrowserRedirect)) {
            window.location.assign(data === null || data === void 0 ? void 0 : data.url);
          }
          return this._returnResult({
            data: { provider: credentials.provider, url: data === null || data === void 0 ? void 0 : data.url },
            error: null
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { provider: credentials.provider, url: null }, error });
          }
          throw error;
        }
      }
      async linkIdentityIdToken(credentials) {
        return await this._useSession(async (result) => {
          var _a;
          try {
            const { error: sessionError, data: { session } } = result;
            if (sessionError)
              throw sessionError;
            const { options, provider, token, access_token, nonce } = credentials;
            const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
              headers: this.headers,
              jwt: (_a = session === null || session === void 0 ? void 0 : session.access_token) !== null && _a !== void 0 ? _a : void 0,
              body: {
                provider,
                id_token: token,
                access_token,
                nonce,
                link_identity: true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponse
            });
            const { data, error } = res;
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            } else if (!data || !data.session || !data.user) {
              return this._returnResult({
                data: { user: null, session: null },
                error: new errors_1.AuthInvalidTokenResponseError()
              });
            }
            if (data.session) {
              await this._saveSession(data.session);
              await this._notifyAllSubscribers("USER_UPDATED", data.session);
            }
            return this._returnResult({ data, error });
          } catch (error) {
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            throw error;
          }
        });
      }
      /**
       * Unlinks an identity from a user by deleting it. The user will no longer be able to sign in with that identity once it's unlinked.
       */
      async unlinkIdentity(identity) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/user/identities/${identity.identity_id}`, {
              headers: this.headers,
              jwt: (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : void 0
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Generates a new JWT.
       * @param refreshToken A valid refresh token that was returned on login.
       */
      async _refreshAccessToken(refreshToken) {
        const debugName = `#_refreshAccessToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          const startedAt = Date.now();
          return await (0, helpers_1.retryable)(async (attempt) => {
            if (attempt > 0) {
              await (0, helpers_1.sleep)(200 * Math.pow(2, attempt - 1));
            }
            this._debug(debugName, "refreshing attempt", attempt);
            return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, {
              body: { refresh_token: refreshToken },
              headers: this.headers,
              xform: fetch_1._sessionResponse
            });
          }, (attempt, error) => {
            const nextBackOffInterval = 200 * Math.pow(2, attempt);
            return error && (0, errors_1.isAuthRetryableFetchError)(error) && // retryable only if the request can be sent before the backoff overflows the tick duration
            Date.now() + nextBackOffInterval - startedAt < constants_1.AUTO_REFRESH_TICK_DURATION_MS;
          });
        } catch (error) {
          this._debug(debugName, "error", error);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        } finally {
          this._debug(debugName, "end");
        }
      }
      _isValidSession(maybeSession) {
        const isValidSession = typeof maybeSession === "object" && maybeSession !== null && "access_token" in maybeSession && "refresh_token" in maybeSession && "expires_at" in maybeSession;
        return isValidSession;
      }
      async _handleProviderSignIn(provider, options) {
        const url = await this._getUrlForProvider(`${this.url}/authorize`, provider, {
          redirectTo: options.redirectTo,
          scopes: options.scopes,
          queryParams: options.queryParams
        });
        this._debug("#_handleProviderSignIn()", "provider", provider, "options", options, "url", url);
        if ((0, helpers_1.isBrowser)() && !options.skipBrowserRedirect) {
          window.location.assign(url);
        }
        return { data: { provider, url }, error: null };
      }
      /**
       * Recovers the session from LocalStorage and refreshes the token
       * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
       */
      async _recoverAndRefresh() {
        var _a, _b;
        const debugName = "#_recoverAndRefresh()";
        this._debug(debugName, "begin");
        try {
          const currentSession = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey);
          if (currentSession && this.userStorage) {
            let maybeUser = await (0, helpers_1.getItemAsync)(this.userStorage, this.storageKey + "-user");
            if (!this.storage.isServer && Object.is(this.storage, this.userStorage) && !maybeUser) {
              maybeUser = { user: currentSession.user };
              await (0, helpers_1.setItemAsync)(this.userStorage, this.storageKey + "-user", maybeUser);
            }
            currentSession.user = (_a = maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) !== null && _a !== void 0 ? _a : (0, helpers_1.userNotAvailableProxy)();
          } else if (currentSession && !currentSession.user) {
            if (!currentSession.user) {
              const separateUser = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey + "-user");
              if (separateUser && (separateUser === null || separateUser === void 0 ? void 0 : separateUser.user)) {
                currentSession.user = separateUser.user;
                await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-user");
                await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, currentSession);
              } else {
                currentSession.user = (0, helpers_1.userNotAvailableProxy)();
              }
            }
          }
          this._debug(debugName, "session from storage", currentSession);
          if (!this._isValidSession(currentSession)) {
            this._debug(debugName, "session is not valid");
            if (currentSession !== null) {
              await this._removeSession();
            }
            return;
          }
          const expiresWithMargin = ((_b = currentSession.expires_at) !== null && _b !== void 0 ? _b : Infinity) * 1e3 - Date.now() < constants_1.EXPIRY_MARGIN_MS;
          this._debug(debugName, `session has${expiresWithMargin ? "" : " not"} expired with margin of ${constants_1.EXPIRY_MARGIN_MS}s`);
          if (expiresWithMargin) {
            if (this.autoRefreshToken && currentSession.refresh_token) {
              const { error } = await this._callRefreshToken(currentSession.refresh_token);
              if (error) {
                console.error(error);
                if (!(0, errors_1.isAuthRetryableFetchError)(error)) {
                  this._debug(debugName, "refresh failed with a non-retryable error, removing the session", error);
                  await this._removeSession();
                }
              }
            }
          } else if (currentSession.user && currentSession.user.__isUserNotAvailableProxy === true) {
            try {
              const { data, error: userError } = await this._getUser(currentSession.access_token);
              if (!userError && (data === null || data === void 0 ? void 0 : data.user)) {
                currentSession.user = data.user;
                await this._saveSession(currentSession);
                await this._notifyAllSubscribers("SIGNED_IN", currentSession);
              } else {
                this._debug(debugName, "could not get user data, skipping SIGNED_IN notification");
              }
            } catch (getUserError) {
              console.error("Error getting user data:", getUserError);
              this._debug(debugName, "error getting user data, skipping SIGNED_IN notification", getUserError);
            }
          } else {
            await this._notifyAllSubscribers("SIGNED_IN", currentSession);
          }
        } catch (err) {
          this._debug(debugName, "error", err);
          console.error(err);
          return;
        } finally {
          this._debug(debugName, "end");
        }
      }
      async _callRefreshToken(refreshToken) {
        var _a, _b;
        if (!refreshToken) {
          throw new errors_1.AuthSessionMissingError();
        }
        if (this.refreshingDeferred) {
          return this.refreshingDeferred.promise;
        }
        const debugName = `#_callRefreshToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          this.refreshingDeferred = new helpers_1.Deferred();
          const { data, error } = await this._refreshAccessToken(refreshToken);
          if (error)
            throw error;
          if (!data.session)
            throw new errors_1.AuthSessionMissingError();
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("TOKEN_REFRESHED", data.session);
          const result = { data: data.session, error: null };
          this.refreshingDeferred.resolve(result);
          return result;
        } catch (error) {
          this._debug(debugName, "error", error);
          if ((0, errors_1.isAuthError)(error)) {
            const result = { data: null, error };
            if (!(0, errors_1.isAuthRetryableFetchError)(error)) {
              await this._removeSession();
            }
            (_a = this.refreshingDeferred) === null || _a === void 0 ? void 0 : _a.resolve(result);
            return result;
          }
          (_b = this.refreshingDeferred) === null || _b === void 0 ? void 0 : _b.reject(error);
          throw error;
        } finally {
          this.refreshingDeferred = null;
          this._debug(debugName, "end");
        }
      }
      async _notifyAllSubscribers(event, session, broadcast = true) {
        const debugName = `#_notifyAllSubscribers(${event})`;
        this._debug(debugName, "begin", session, `broadcast = ${broadcast}`);
        try {
          if (this.broadcastChannel && broadcast) {
            this.broadcastChannel.postMessage({ event, session });
          }
          const errors = [];
          const promises = Array.from(this.stateChangeEmitters.values()).map(async (x) => {
            try {
              await x.callback(event, session);
            } catch (e) {
              errors.push(e);
            }
          });
          await Promise.all(promises);
          if (errors.length > 0) {
            for (let i = 0; i < errors.length; i += 1) {
              console.error(errors[i]);
            }
            throw errors[0];
          }
        } finally {
          this._debug(debugName, "end");
        }
      }
      /**
       * set currentSession and currentUser
       * process to _startAutoRefreshToken if possible
       */
      async _saveSession(session) {
        this._debug("#_saveSession()", session);
        this.suppressGetSessionWarning = true;
        await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        const sessionToProcess = Object.assign({}, session);
        const userIsProxy = sessionToProcess.user && sessionToProcess.user.__isUserNotAvailableProxy === true;
        if (this.userStorage) {
          if (!userIsProxy && sessionToProcess.user) {
            await (0, helpers_1.setItemAsync)(this.userStorage, this.storageKey + "-user", {
              user: sessionToProcess.user
            });
          } else if (userIsProxy) {
          }
          const mainSessionData = Object.assign({}, sessionToProcess);
          delete mainSessionData.user;
          const clonedMainSessionData = (0, helpers_1.deepClone)(mainSessionData);
          await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, clonedMainSessionData);
        } else {
          const clonedSession = (0, helpers_1.deepClone)(sessionToProcess);
          await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, clonedSession);
        }
      }
      async _removeSession() {
        this._debug("#_removeSession()");
        this.suppressGetSessionWarning = false;
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey);
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-code-verifier");
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-user");
        if (this.userStorage) {
          await (0, helpers_1.removeItemAsync)(this.userStorage, this.storageKey + "-user");
        }
        await this._notifyAllSubscribers("SIGNED_OUT", null);
      }
      /**
       * Removes any registered visibilitychange callback.
       *
       * {@see #startAutoRefresh}
       * {@see #stopAutoRefresh}
       */
      _removeVisibilityChangedCallback() {
        this._debug("#_removeVisibilityChangedCallback()");
        const callback = this.visibilityChangedCallback;
        this.visibilityChangedCallback = null;
        try {
          if (callback && (0, helpers_1.isBrowser)() && (window === null || window === void 0 ? void 0 : window.removeEventListener)) {
            window.removeEventListener("visibilitychange", callback);
          }
        } catch (e) {
          console.error("removing visibilitychange callback failed", e);
        }
      }
      /**
       * This is the private implementation of {@link #startAutoRefresh}. Use this
       * within the library.
       */
      async _startAutoRefresh() {
        await this._stopAutoRefresh();
        this._debug("#_startAutoRefresh()");
        const ticker = setInterval(() => this._autoRefreshTokenTick(), constants_1.AUTO_REFRESH_TICK_DURATION_MS);
        this.autoRefreshTicker = ticker;
        if (ticker && typeof ticker === "object" && typeof ticker.unref === "function") {
          ticker.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(ticker);
        }
        const timeout = setTimeout(async () => {
          await this.initializePromise;
          await this._autoRefreshTokenTick();
        }, 0);
        this.autoRefreshTickTimeout = timeout;
        if (timeout && typeof timeout === "object" && typeof timeout.unref === "function") {
          timeout.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(timeout);
        }
      }
      /**
       * This is the private implementation of {@link #stopAutoRefresh}. Use this
       * within the library.
       */
      async _stopAutoRefresh() {
        this._debug("#_stopAutoRefresh()");
        const ticker = this.autoRefreshTicker;
        this.autoRefreshTicker = null;
        if (ticker) {
          clearInterval(ticker);
        }
        const timeout = this.autoRefreshTickTimeout;
        this.autoRefreshTickTimeout = null;
        if (timeout) {
          clearTimeout(timeout);
        }
      }
      /**
       * Starts an auto-refresh process in the background. The session is checked
       * every few seconds. Close to the time of expiration a process is started to
       * refresh the session. If refreshing fails it will be retried for as long as
       * necessary.
       *
       * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
       * to call this function, it will be called for you.
       *
       * On browsers the refresh process works only when the tab/window is in the
       * foreground to conserve resources as well as prevent race conditions and
       * flooding auth with requests. If you call this method any managed
       * visibility change callback will be removed and you must manage visibility
       * changes on your own.
       *
       * On non-browser platforms the refresh process works *continuously* in the
       * background, which may not be desirable. You should hook into your
       * platform's foreground indication mechanism and call these methods
       * appropriately to conserve resources.
       *
       * {@see #stopAutoRefresh}
       */
      async startAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._startAutoRefresh();
      }
      /**
       * Stops an active auto refresh process running in the background (if any).
       *
       * If you call this method any managed visibility change callback will be
       * removed and you must manage visibility changes on your own.
       *
       * See {@link #startAutoRefresh} for more details.
       */
      async stopAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._stopAutoRefresh();
      }
      /**
       * Runs the auto refresh token tick.
       */
      async _autoRefreshTokenTick() {
        this._debug("#_autoRefreshTokenTick()", "begin");
        try {
          await this._acquireLock(0, async () => {
            try {
              const now = Date.now();
              try {
                return await this._useSession(async (result) => {
                  const { data: { session } } = result;
                  if (!session || !session.refresh_token || !session.expires_at) {
                    this._debug("#_autoRefreshTokenTick()", "no session");
                    return;
                  }
                  const expiresInTicks = Math.floor((session.expires_at * 1e3 - now) / constants_1.AUTO_REFRESH_TICK_DURATION_MS);
                  this._debug("#_autoRefreshTokenTick()", `access token expires in ${expiresInTicks} ticks, a tick lasts ${constants_1.AUTO_REFRESH_TICK_DURATION_MS}ms, refresh threshold is ${constants_1.AUTO_REFRESH_TICK_THRESHOLD} ticks`);
                  if (expiresInTicks <= constants_1.AUTO_REFRESH_TICK_THRESHOLD) {
                    await this._callRefreshToken(session.refresh_token);
                  }
                });
              } catch (e) {
                console.error("Auto refresh tick failed with error. This is likely a transient error.", e);
              }
            } finally {
              this._debug("#_autoRefreshTokenTick()", "end");
            }
          });
        } catch (e) {
          if (e.isAcquireTimeout || e instanceof locks_1.LockAcquireTimeoutError) {
            this._debug("auto refresh token tick lock not available");
          } else {
            throw e;
          }
        }
      }
      /**
       * Registers callbacks on the browser / platform, which in-turn run
       * algorithms when the browser window/tab are in foreground. On non-browser
       * platforms it assumes always foreground.
       */
      async _handleVisibilityChange() {
        this._debug("#_handleVisibilityChange()");
        if (!(0, helpers_1.isBrowser)() || !(window === null || window === void 0 ? void 0 : window.addEventListener)) {
          if (this.autoRefreshToken) {
            this.startAutoRefresh();
          }
          return false;
        }
        try {
          this.visibilityChangedCallback = async () => {
            try {
              await this._onVisibilityChanged(false);
            } catch (error) {
              this._debug("#visibilityChangedCallback", "error", error);
            }
          };
          window === null || window === void 0 ? void 0 : window.addEventListener("visibilitychange", this.visibilityChangedCallback);
          await this._onVisibilityChanged(true);
        } catch (error) {
          console.error("_handleVisibilityChange", error);
        }
      }
      /**
       * Callback registered with `window.addEventListener('visibilitychange')`.
       */
      async _onVisibilityChanged(calledFromInitialize) {
        const methodName = `#_onVisibilityChanged(${calledFromInitialize})`;
        this._debug(methodName, "visibilityState", document.visibilityState);
        if (document.visibilityState === "visible") {
          if (this.autoRefreshToken) {
            this._startAutoRefresh();
          }
          if (!calledFromInitialize) {
            await this.initializePromise;
            await this._acquireLock(this.lockAcquireTimeout, async () => {
              if (document.visibilityState !== "visible") {
                this._debug(methodName, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
                return;
              }
              await this._recoverAndRefresh();
            });
          }
        } else if (document.visibilityState === "hidden") {
          if (this.autoRefreshToken) {
            this._stopAutoRefresh();
          }
        }
      }
      /**
       * Generates the relevant login URL for a third-party provider.
       * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
       * @param options.scopes A space-separated list of scopes granted to the OAuth application.
       * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
       */
      async _getUrlForProvider(url, provider, options) {
        const urlParams = [`provider=${encodeURIComponent(provider)}`];
        if (options === null || options === void 0 ? void 0 : options.redirectTo) {
          urlParams.push(`redirect_to=${encodeURIComponent(options.redirectTo)}`);
        }
        if (options === null || options === void 0 ? void 0 : options.scopes) {
          urlParams.push(`scopes=${encodeURIComponent(options.scopes)}`);
        }
        if (this.flowType === "pkce") {
          const [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
          const flowParams = new URLSearchParams({
            code_challenge: `${encodeURIComponent(codeChallenge)}`,
            code_challenge_method: `${encodeURIComponent(codeChallengeMethod)}`
          });
          urlParams.push(flowParams.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.queryParams) {
          const query = new URLSearchParams(options.queryParams);
          urlParams.push(query.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.skipBrowserRedirect) {
          urlParams.push(`skip_http_redirect=${options.skipBrowserRedirect}`);
        }
        return `${url}?${urlParams.join("&")}`;
      }
      async _unenroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/factors/${params.factorId}`, {
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _enroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            const body = Object.assign({ friendly_name: params.friendlyName, factor_type: params.factorType }, params.factorType === "phone" ? { phone: params.phone } : params.factorType === "totp" ? { issuer: params.issuer } : {});
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors`, {
              body,
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
            if (error) {
              return this._returnResult({ data: null, error });
            }
            if (params.factorType === "totp" && data.type === "totp" && ((_b = data === null || data === void 0 ? void 0 : data.totp) === null || _b === void 0 ? void 0 : _b.qr_code)) {
              data.totp.qr_code = `data:image/svg+xml;utf-8,${data.totp.qr_code}`;
            }
            return this._returnResult({ data, error: null });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _verify(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const body = Object.assign({ challenge_id: params.challengeId }, "webauthn" in params ? {
                webauthn: Object.assign(Object.assign({}, params.webauthn), { credential_response: params.webauthn.type === "create" ? (0, webauthn_1.serializeCredentialCreationResponse)(params.webauthn.credential_response) : (0, webauthn_1.serializeCredentialRequestResponse)(params.webauthn.credential_response) })
              } : { code: params.code });
              const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors/${params.factorId}/verify`, {
                body,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (error) {
                return this._returnResult({ data: null, error });
              }
              await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + data.expires_in }, data));
              await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", data);
              return this._returnResult({ data, error });
            });
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      async _challenge(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors/${params.factorId}/challenge`, {
                body: params,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (response.error) {
                return response;
              }
              const { data } = response;
              if (data.type !== "webauthn") {
                return { data, error: null };
              }
              switch (data.webauthn.type) {
                case "create":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: (0, webauthn_1.deserializeCredentialCreationOptions)(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
                case "request":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: (0, webauthn_1.deserializeCredentialRequestOptions)(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
              }
            });
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      /**
       * {@see GoTrueMFAApi#challengeAndVerify}
       */
      async _challengeAndVerify(params) {
        const { data: challengeData, error: challengeError } = await this._challenge({
          factorId: params.factorId
        });
        if (challengeError) {
          return this._returnResult({ data: null, error: challengeError });
        }
        return await this._verify({
          factorId: params.factorId,
          challengeId: challengeData.id,
          code: params.code
        });
      }
      /**
       * {@see GoTrueMFAApi#listFactors}
       */
      async _listFactors() {
        var _a;
        const { data: { user }, error: userError } = await this.getUser();
        if (userError) {
          return { data: null, error: userError };
        }
        const data = {
          all: [],
          phone: [],
          totp: [],
          webauthn: []
        };
        for (const factor of (_a = user === null || user === void 0 ? void 0 : user.factors) !== null && _a !== void 0 ? _a : []) {
          data.all.push(factor);
          if (factor.status === "verified") {
            ;
            data[factor.factor_type].push(factor);
          }
        }
        return {
          data,
          error: null
        };
      }
      /**
       * {@see GoTrueMFAApi#getAuthenticatorAssuranceLevel}
       */
      async _getAuthenticatorAssuranceLevel(jwt) {
        var _a, _b, _c, _d;
        if (jwt) {
          try {
            const { payload: payload2 } = (0, helpers_1.decodeJWT)(jwt);
            let currentLevel2 = null;
            if (payload2.aal) {
              currentLevel2 = payload2.aal;
            }
            let nextLevel2 = currentLevel2;
            const { data: { user }, error: userError } = await this.getUser(jwt);
            if (userError) {
              return this._returnResult({ data: null, error: userError });
            }
            const verifiedFactors2 = (_b = (_a = user === null || user === void 0 ? void 0 : user.factors) === null || _a === void 0 ? void 0 : _a.filter((factor) => factor.status === "verified")) !== null && _b !== void 0 ? _b : [];
            if (verifiedFactors2.length > 0) {
              nextLevel2 = "aal2";
            }
            const currentAuthenticationMethods2 = payload2.amr || [];
            return { data: { currentLevel: currentLevel2, nextLevel: nextLevel2, currentAuthenticationMethods: currentAuthenticationMethods2 }, error: null };
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        }
        const { data: { session }, error: sessionError } = await this.getSession();
        if (sessionError) {
          return this._returnResult({ data: null, error: sessionError });
        }
        if (!session) {
          return {
            data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
            error: null
          };
        }
        const { payload } = (0, helpers_1.decodeJWT)(session.access_token);
        let currentLevel = null;
        if (payload.aal) {
          currentLevel = payload.aal;
        }
        let nextLevel = currentLevel;
        const verifiedFactors = (_d = (_c = session.user.factors) === null || _c === void 0 ? void 0 : _c.filter((factor) => factor.status === "verified")) !== null && _d !== void 0 ? _d : [];
        if (verifiedFactors.length > 0) {
          nextLevel = "aal2";
        }
        const currentAuthenticationMethods = payload.amr || [];
        return { data: { currentLevel, nextLevel, currentAuthenticationMethods }, error: null };
      }
      /**
       * Retrieves details about an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * Returns authorization details including client info, scopes, and user information.
       * If the response includes only a redirect_url field, it means consent was already given - the caller
       * should handle the redirect manually if needed.
       */
      async _getAuthorizationDetails(authorizationId) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/oauth/authorizations/${authorizationId}`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Approves an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _approveAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "approve" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if ((0, helpers_1.isBrowser)() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Denies an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _denyAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "deny" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if ((0, helpers_1.isBrowser)() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth grants that the authenticated user has authorized.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _listOAuthGrants() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Revokes a user's OAuth grant for a specific client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _revokeOAuthGrant(options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              query: { client_id: options.clientId },
              noResolveJson: true
            });
            return { data: {}, error: null };
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async fetchJwk(kid, jwks = { keys: [] }) {
        let jwk = jwks.keys.find((key) => key.kid === kid);
        if (jwk) {
          return jwk;
        }
        const now = Date.now();
        jwk = this.jwks.keys.find((key) => key.kid === kid);
        if (jwk && this.jwks_cached_at + constants_1.JWKS_TTL > now) {
          return jwk;
        }
        const { data, error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, {
          headers: this.headers
        });
        if (error) {
          throw error;
        }
        if (!data.keys || data.keys.length === 0) {
          return null;
        }
        this.jwks = data;
        this.jwks_cached_at = now;
        jwk = data.keys.find((key) => key.kid === kid);
        if (!jwk) {
          return null;
        }
        return jwk;
      }
      /**
       * Extracts the JWT claims present in the access token by first verifying the
       * JWT against the server's JSON Web Key Set endpoint
       * `/.well-known/jwks.json` which is often cached, resulting in significantly
       * faster responses. Prefer this method over {@link #getUser} which always
       * sends a request to the Auth server for each JWT.
       *
       * If the project is not using an asymmetric JWT signing key (like ECC or
       * RSA) it always sends a request to the Auth server (similar to {@link
       * #getUser}) to verify the JWT.
       *
       * @param jwt An optional specific JWT you wish to verify, not the one you
       *            can obtain from {@link #getSession}.
       * @param options Various additional options that allow you to customize the
       *                behavior of this method.
       */
      async getClaims(jwt, options = {}) {
        try {
          let token = jwt;
          if (!token) {
            const { data, error } = await this.getSession();
            if (error || !data.session) {
              return this._returnResult({ data: null, error });
            }
            token = data.session.access_token;
          }
          const { header, payload, signature, raw: { header: rawHeader, payload: rawPayload } } = (0, helpers_1.decodeJWT)(token);
          if (!(options === null || options === void 0 ? void 0 : options.allowExpired)) {
            (0, helpers_1.validateExp)(payload.exp);
          }
          const signingKey = !header.alg || header.alg.startsWith("HS") || !header.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(header.kid, (options === null || options === void 0 ? void 0 : options.keys) ? { keys: options.keys } : options === null || options === void 0 ? void 0 : options.jwks);
          if (!signingKey) {
            const { error } = await this.getUser(token);
            if (error) {
              throw error;
            }
            return {
              data: {
                claims: payload,
                header,
                signature
              },
              error: null
            };
          }
          const algorithm = (0, helpers_1.getAlgorithm)(header.alg);
          const publicKey = await crypto.subtle.importKey("jwk", signingKey, algorithm, true, [
            "verify"
          ]);
          const isValid = await crypto.subtle.verify(algorithm, publicKey, signature, (0, base64url_1.stringToUint8Array)(`${rawHeader}.${rawPayload}`));
          if (!isValid) {
            throw new errors_1.AuthInvalidJwtError("Invalid JWT signature");
          }
          return {
            data: {
              claims: payload,
              header,
              signature
            },
            error: null
          };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
    };
    GoTrueClient.nextInstanceID = {};
    exports.default = GoTrueClient;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/AuthAdminApi.js
var require_AuthAdminApi = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/AuthAdminApi.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    var AuthAdminApi = GoTrueAdminApi_1.default;
    exports.default = AuthAdminApi;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/AuthClient.js
var require_AuthClient = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/AuthClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueClient_1 = tslib_1.__importDefault(require_GoTrueClient());
    var AuthClient2 = GoTrueClient_1.default;
    exports.default = AuthClient2;
  }
});

// ../../node_modules/@supabase/auth-js/dist/main/index.js
var require_main3 = __commonJS({
  "../../node_modules/@supabase/auth-js/dist/main/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.processLock = exports.lockInternals = exports.NavigatorLockAcquireTimeoutError = exports.navigatorLock = exports.AuthClient = exports.AuthAdminApi = exports.GoTrueClient = exports.GoTrueAdminApi = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    exports.GoTrueAdminApi = GoTrueAdminApi_1.default;
    var GoTrueClient_1 = tslib_1.__importDefault(require_GoTrueClient());
    exports.GoTrueClient = GoTrueClient_1.default;
    var AuthAdminApi_1 = tslib_1.__importDefault(require_AuthAdminApi());
    exports.AuthAdminApi = AuthAdminApi_1.default;
    var AuthClient_1 = tslib_1.__importDefault(require_AuthClient());
    exports.AuthClient = AuthClient_1.default;
    tslib_1.__exportStar(require_types2(), exports);
    tslib_1.__exportStar(require_errors(), exports);
    var locks_1 = require_locks();
    Object.defineProperty(exports, "navigatorLock", { enumerable: true, get: function() {
      return locks_1.navigatorLock;
    } });
    Object.defineProperty(exports, "NavigatorLockAcquireTimeoutError", { enumerable: true, get: function() {
      return locks_1.NavigatorLockAcquireTimeoutError;
    } });
    Object.defineProperty(exports, "lockInternals", { enumerable: true, get: function() {
      return locks_1.internals;
    } });
    Object.defineProperty(exports, "processLock", { enumerable: true, get: function() {
      return locks_1.processLock;
    } });
  }
});

// ../../node_modules/ws/lib/constants.js
var require_constants3 = __commonJS({
  "../../node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants3();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// ../../node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants3();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants3();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants3();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// ../../node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants3();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants3();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// ../../node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash: createHash2 } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants3();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket3 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head2, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head2.length > 0) socket.unshift(head2);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket3, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket3.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket3, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket3.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket3, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket3.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket3, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket3.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket3.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket3.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket3.prototype.addEventListener = addEventListener;
    WebSocket3.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket3;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head2) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket3.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head2, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket3.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket3.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket3.CLOSED) return;
      if (websocket.readyState === WebSocket3.OPEN) {
        websocket._readyState = WebSocket3.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket3.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket3.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket3.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket3 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// ../../node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// ../../node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash: createHash2 } = __require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket3 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants3();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket3,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head2) => {
              this.handleUpgrade(req, socket, head2, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head2, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version3 = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version3 !== 13 && version3 !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version3 === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head2,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head2, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head2, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head2, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// ../local-agent/dist/index.js
import { createWriteStream } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join7 } from "node:path";

// ../local-agent/dist/config.js
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ../shared/src/validators.ts
var ALLOWED_MODELS = /* @__PURE__ */ new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "codex",
  "gpt-5.3-codex",
  "gpt-5.3-codex xhigh",
  "gpt-5.3-codex-spark"
]);
function isString(v) {
  return typeof v === "string";
}
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function hasValidProtocolVersion(v) {
  return v.protocolVersion === PROTOCOL_VERSION;
}
function isStartJob(v) {
  if (!isObject(v) || v.type !== "start_job") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(v.jobId)) return false;
  if (!isString(v.cardId) || v.cardId.length === 0) return false;
  if (!["code", "infra", "design", "research", "docs", "persistent_agent", "verify", "breakdown", "combine", "merge", "deploy_to_test", "deploy_to_prod", "review", "bug", "feature_test"].includes(v.cardType)) return false;
  if (!["simple", "medium", "complex"].includes(v.complexity)) return false;
  if (!["claude_code", "codex"].includes(v.slotType)) return false;
  if (!isString(v.model) || !ALLOWED_MODELS.has(v.model)) return false;
  if (!isString(v.projectId) || v.projectId.length === 0) return false;
  if (v.repoUrl !== void 0 && v.repoUrl !== null && (!isString(v.repoUrl) || v.repoUrl.length === 0)) return false;
  if (v.featureBranch !== void 0 && v.featureBranch !== null && (!isString(v.featureBranch) || v.featureBranch.length === 0)) return false;
  const hasPromptStack = isString(v.promptStackMinusSkills) && v.promptStackMinusSkills.length > 0;
  const hasContext = isString(v.context);
  const hasContextRef = isString(v.contextRef) && v.contextRef.length > 0;
  if (!hasPromptStack && !hasContext && !hasContextRef) return false;
  if (hasContext && v.context.length > MAX_CONTEXT_BYTES) return false;
  if (v.role !== void 0 && (!isString(v.role) || v.role.length === 0)) return false;
  if (v.personalityPrompt !== void 0 && (!isString(v.personalityPrompt) || v.personalityPrompt.length === 0 || v.personalityPrompt.length > MAX_PERSONALITY_PROMPT_BYTES)) return false;
  if (v.subAgentPrompt !== void 0 && (!isString(v.subAgentPrompt) || v.subAgentPrompt.length === 0 || v.subAgentPrompt.length > MAX_PERSONALITY_PROMPT_BYTES)) return false;
  if (v.dependencyBranches !== void 0) {
    if (!Array.isArray(v.dependencyBranches) || v.dependencyBranches.length === 0) return false;
    if (!v.dependencyBranches.every((b) => isString(b) && b.length > 0)) return false;
  }
  if (v.roleMcpTools !== void 0) {
    if (!Array.isArray(v.roleMcpTools)) return false;
    if (!v.roleMcpTools.every((t) => isString(t) && t.length > 0)) return false;
  }
  if (v.companyProjects !== void 0) {
    if (!Array.isArray(v.companyProjects)) return false;
    if (!v.companyProjects.every(
      (p) => isObject(p) && isString(p.name) && p.name.length > 0 && (p.repo_url === null || isString(p.repo_url) && p.repo_url.length > 0)
    )) {
      return false;
    }
  }
  return true;
}
function isStopJob(v) {
  if (!isObject(v) || v.type !== "stop_job") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.reason)) return false;
  return true;
}
function isHealthCheck(v) {
  if (!isObject(v) || v.type !== "health_check") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (v.correlationId !== void 0 && !isString(v.correlationId)) return false;
  return true;
}
function isVerifyJob(v) {
  if (!isObject(v) || v.type !== "verify_job") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.featureBranch) || v.featureBranch.length === 0) return false;
  if (!isString(v.jobBranch) || v.jobBranch.length === 0) return false;
  if (!isString(v.acceptanceTests)) return false;
  if (v.repoPath !== void 0 && (!isString(v.repoPath) || v.repoPath.length === 0)) return false;
  return true;
}
function isDeployToTest(v) {
  if (!isObject(v) || v.type !== "deploy_to_test") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobType) || !["feature", "standalone"].includes(v.jobType)) return false;
  if (v.jobType === "feature" && (!isString(v.featureId) || v.featureId.length === 0)) return false;
  if (v.jobType === "standalone" && (!isString(v.standaloneJobId) || v.standaloneJobId.length === 0)) return false;
  if (!isString(v.featureBranch) || v.featureBranch.length === 0) return false;
  if (!isString(v.projectId) || v.projectId.length === 0) return false;
  if (v.changeSummary !== void 0 && !isString(v.changeSummary)) return false;
  if (v.repoPath !== void 0 && !isString(v.repoPath)) return false;
  return true;
}
function isTeardownTest(v) {
  if (!isObject(v) || v.type !== "teardown_test") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.repoPath) || v.repoPath.length === 0) return false;
  return true;
}
function isMessageInbound(v) {
  if (!isObject(v) || v.type !== "message_inbound") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.conversationId) || v.conversationId.length === 0) return false;
  if (!isString(v.from) || v.from.length === 0) return false;
  if (!isString(v.text)) return false;
  return true;
}
function isJobUnblocked(v) {
  if (!isObject(v) || v.type !== "job_unblocked") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.answer)) return false;
  return true;
}
function isStartExpert(v) {
  if (!isObject(v) || v.type !== "start_expert") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.session_id) || v.session_id.length === 0) return false;
  if (!isString(v.model) || v.model.length === 0) return false;
  if (!isString(v.brief)) return false;
  if (!isObject(v.role)) return false;
  if (!isString(v.role.prompt)) return false;
  if (v.project_id !== void 0 && (!isString(v.project_id) || v.project_id.length === 0)) return false;
  if (v.repo_url !== void 0 && (!isString(v.repo_url) || v.repo_url.length === 0)) return false;
  if (v.branch !== void 0 && (!isString(v.branch) || v.branch.length === 0)) return false;
  if (v.display_name !== void 0 && !isString(v.display_name)) return false;
  if (v.company_name !== void 0 && !isString(v.company_name)) return false;
  return true;
}
function isOrchestratorMessage(v) {
  if (!isObject(v) || !isString(v.type)) return false;
  switch (v.type) {
    case "start_job":
      return isStartJob(v);
    case "stop_job":
      return isStopJob(v);
    case "health_check":
      return isHealthCheck(v);
    case "verify_job":
      return isVerifyJob(v);
    case "deploy_to_test":
      return isDeployToTest(v);
    case "teardown_test":
      return isTeardownTest(v);
    case "message_inbound":
      return isMessageInbound(v);
    case "job_unblocked":
      return isJobUnblocked(v);
    case "start_expert":
      return isStartExpert(v);
    default:
      return false;
  }
}

// ../shared/src/index.ts
var DEFAULT_SUPABASE_URL = "https://jmussmwglgbwncgygzbz.supabase.co";
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptdXNzbXdnbGdid25jZ3lnemJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTMyNDEsImV4cCI6MjA4NzAyOTI0MX0.bI2U8TNQ5FZ5ri3DUWJGZFuvC99WGc-fslmZZ5TcQo0";
var PROTOCOL_VERSION = 1;
var HEARTBEAT_INTERVAL_MS = 3e4;
var MACHINE_DEAD_THRESHOLD_MS = 12e4;
var MAX_CONTEXT_BYTES = 64e3;
var MAX_PERSONALITY_PROMPT_BYTES = 16e3;

// ../local-agent/dist/config.js
var CONFIG_PATH = join(homedir(), ".zazigv2", "config.json");
function loadConfig() {
  const nameFromEnv = process.env["ZAZIG_MACHINE_NAME"];
  const claudeFromEnv = process.env["ZAZIG_SLOTS_CLAUDE_CODE"];
  const codexFromEnv = process.env["ZAZIG_SLOTS_CODEX"];
  let name;
  let slots;
  let companyIdFromFile;
  if (nameFromEnv) {
    name = nameFromEnv;
    slots = {
      claude_code: parseInt(claudeFromEnv ?? "4", 10) || 4,
      codex: parseInt(codexFromEnv ?? "4", 10) || 4
    };
  } else if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.name || typeof parsed.name !== "string") {
      throw new Error("config.json: missing or invalid 'name' field");
    }
    name = parsed.name;
    companyIdFromFile = parsed.company_id;
    slots = {
      claude_code: parsed.slots?.claude_code ?? 4,
      codex: parsed.slots?.codex ?? 4
    };
  } else {
    throw new Error(`No machine config found at ${CONFIG_PATH}. Run 'zazig start' to configure.`);
  }
  const supabaseUrl = process.env["SUPABASE_URL"] ?? DEFAULT_SUPABASE_URL;
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const accessToken = process.env["SUPABASE_ACCESS_TOKEN"];
  const refreshToken = process.env["SUPABASE_REFRESH_TOKEN"];
  const companyId = process.env["ZAZIG_COMPANY_ID"] ?? companyIdFromFile;
  return {
    name,
    ...companyId ? { company_id: companyId } : {},
    slots,
    supabase: {
      url: supabaseUrl,
      anon_key: anonKey,
      ...serviceRoleKey ? { service_role_key: serviceRoleKey } : {},
      ...accessToken ? { access_token: accessToken } : {},
      ...refreshToken ? { refresh_token: refreshToken } : {}
    }
  };
}

// ../local-agent/dist/slots.js
var SlotTracker = class {
  total;
  inUse;
  constructor(config) {
    this.total = {
      claude_code: config.claude_code,
      codex: config.codex
    };
    this.inUse = {
      claude_code: 0,
      codex: 0
    };
  }
  /** Returns the number of free slots per slot type. */
  getAvailable() {
    return {
      claude_code: Math.max(0, this.total.claude_code - this.inUse.claude_code),
      codex: Math.max(0, this.total.codex - this.inUse.codex)
    };
  }
  /** Acquire a slot; throws if none are available. For future use by job executor. */
  acquire(slotType) {
    const available = this.total[slotType] - this.inUse[slotType];
    if (available <= 0) {
      throw new Error(`No available slots for ${slotType}`);
    }
    this.inUse[slotType]++;
  }
  /** Try to acquire a slot. Returns true if acquired, false if at capacity. */
  tryAcquire(slotType) {
    const available = this.total[slotType] - this.inUse[slotType];
    if (available <= 0)
      return false;
    this.inUse[slotType]++;
    return true;
  }
  /** Release a slot previously acquired. For future use by job executor. */
  release(slotType) {
    if (this.inUse[slotType] > 0) {
      this.inUse[slotType]--;
    }
  }
};

// ../../node_modules/@supabase/supabase-js/dist/index.mjs
var dist_exports = {};
__export(dist_exports, {
  FunctionRegion: () => import_functions_js.FunctionRegion,
  FunctionsError: () => import_functions_js.FunctionsError,
  FunctionsFetchError: () => import_functions_js.FunctionsFetchError,
  FunctionsHttpError: () => import_functions_js.FunctionsHttpError,
  FunctionsRelayError: () => import_functions_js.FunctionsRelayError,
  PostgrestError: () => PostgrestError,
  SupabaseClient: () => SupabaseClient,
  createClient: () => createClient
});
var import_functions_js = __toESM(require_main(), 1);

// ../../node_modules/@supabase/postgrest-js/dist/index.mjs
var PostgrestError = class extends Error {
  /**
  * @example
  * ```ts
  * import PostgrestError from '@supabase/postgrest-js'
  *
  * throw new PostgrestError({
  *   message: 'Row level security prevented the request',
  *   details: 'RLS denied the insert',
  *   hint: 'Check your policies',
  *   code: 'PGRST301',
  * })
  * ```
  */
  constructor(context) {
    super(context.message);
    this.name = "PostgrestError";
    this.details = context.details;
    this.hint = context.hint;
    this.code = context.code;
  }
};
var PostgrestBuilder = class {
  /**
  * Creates a builder configured for a specific PostgREST request.
  *
  * @example
  * ```ts
  * import PostgrestQueryBuilder from '@supabase/postgrest-js'
  *
  * const builder = new PostgrestQueryBuilder(
  *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
  *   { headers: new Headers({ apikey: 'public-anon-key' }) }
  * )
  * ```
  */
  constructor(builder) {
    var _builder$shouldThrowO, _builder$isMaybeSingl, _builder$urlLengthLim;
    this.shouldThrowOnError = false;
    this.method = builder.method;
    this.url = builder.url;
    this.headers = new Headers(builder.headers);
    this.schema = builder.schema;
    this.body = builder.body;
    this.shouldThrowOnError = (_builder$shouldThrowO = builder.shouldThrowOnError) !== null && _builder$shouldThrowO !== void 0 ? _builder$shouldThrowO : false;
    this.signal = builder.signal;
    this.isMaybeSingle = (_builder$isMaybeSingl = builder.isMaybeSingle) !== null && _builder$isMaybeSingl !== void 0 ? _builder$isMaybeSingl : false;
    this.urlLengthLimit = (_builder$urlLengthLim = builder.urlLengthLimit) !== null && _builder$urlLengthLim !== void 0 ? _builder$urlLengthLim : 8e3;
    if (builder.fetch) this.fetch = builder.fetch;
    else this.fetch = fetch;
  }
  /**
  * If there's an error with the query, throwOnError will reject the promise by
  * throwing the error instead of returning it as part of a successful response.
  *
  * {@link https://github.com/supabase/supabase-js/issues/92}
  */
  throwOnError() {
    this.shouldThrowOnError = true;
    return this;
  }
  /**
  * Set an HTTP header for the request.
  */
  setHeader(name, value) {
    this.headers = new Headers(this.headers);
    this.headers.set(name, value);
    return this;
  }
  then(onfulfilled, onrejected) {
    var _this = this;
    if (this.schema === void 0) {
    } else if (["GET", "HEAD"].includes(this.method)) this.headers.set("Accept-Profile", this.schema);
    else this.headers.set("Content-Profile", this.schema);
    if (this.method !== "GET" && this.method !== "HEAD") this.headers.set("Content-Type", "application/json");
    const _fetch = this.fetch;
    let res = _fetch(this.url.toString(), {
      method: this.method,
      headers: this.headers,
      body: JSON.stringify(this.body),
      signal: this.signal
    }).then(async (res$1) => {
      let error = null;
      let data = null;
      let count = null;
      let status = res$1.status;
      let statusText = res$1.statusText;
      if (res$1.ok) {
        var _this$headers$get2, _res$headers$get;
        if (_this.method !== "HEAD") {
          var _this$headers$get;
          const body = await res$1.text();
          if (body === "") {
          } else if (_this.headers.get("Accept") === "text/csv") data = body;
          else if (_this.headers.get("Accept") && ((_this$headers$get = _this.headers.get("Accept")) === null || _this$headers$get === void 0 ? void 0 : _this$headers$get.includes("application/vnd.pgrst.plan+text"))) data = body;
          else data = JSON.parse(body);
        }
        const countHeader = (_this$headers$get2 = _this.headers.get("Prefer")) === null || _this$headers$get2 === void 0 ? void 0 : _this$headers$get2.match(/count=(exact|planned|estimated)/);
        const contentRange = (_res$headers$get = res$1.headers.get("content-range")) === null || _res$headers$get === void 0 ? void 0 : _res$headers$get.split("/");
        if (countHeader && contentRange && contentRange.length > 1) count = parseInt(contentRange[1]);
        if (_this.isMaybeSingle && _this.method === "GET" && Array.isArray(data)) if (data.length > 1) {
          error = {
            code: "PGRST116",
            details: `Results contain ${data.length} rows, application/vnd.pgrst.object+json requires 1 row`,
            hint: null,
            message: "JSON object requested, multiple (or no) rows returned"
          };
          data = null;
          count = null;
          status = 406;
          statusText = "Not Acceptable";
        } else if (data.length === 1) data = data[0];
        else data = null;
      } else {
        var _error$details;
        const body = await res$1.text();
        try {
          error = JSON.parse(body);
          if (Array.isArray(error) && res$1.status === 404) {
            data = [];
            error = null;
            status = 200;
            statusText = "OK";
          }
        } catch (_unused) {
          if (res$1.status === 404 && body === "") {
            status = 204;
            statusText = "No Content";
          } else error = { message: body };
        }
        if (error && _this.isMaybeSingle && (error === null || error === void 0 || (_error$details = error.details) === null || _error$details === void 0 ? void 0 : _error$details.includes("0 rows"))) {
          error = null;
          status = 200;
          statusText = "OK";
        }
        if (error && _this.shouldThrowOnError) throw new PostgrestError(error);
      }
      return {
        error,
        data,
        count,
        status,
        statusText
      };
    });
    if (!this.shouldThrowOnError) res = res.catch((fetchError) => {
      var _fetchError$name2;
      let errorDetails = "";
      let hint = "";
      let code = "";
      const cause = fetchError === null || fetchError === void 0 ? void 0 : fetchError.cause;
      if (cause) {
        var _cause$message, _cause$code, _fetchError$name, _cause$name;
        const causeMessage = (_cause$message = cause === null || cause === void 0 ? void 0 : cause.message) !== null && _cause$message !== void 0 ? _cause$message : "";
        const causeCode = (_cause$code = cause === null || cause === void 0 ? void 0 : cause.code) !== null && _cause$code !== void 0 ? _cause$code : "";
        errorDetails = `${(_fetchError$name = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name !== void 0 ? _fetchError$name : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`;
        errorDetails += `

Caused by: ${(_cause$name = cause === null || cause === void 0 ? void 0 : cause.name) !== null && _cause$name !== void 0 ? _cause$name : "Error"}: ${causeMessage}`;
        if (causeCode) errorDetails += ` (${causeCode})`;
        if (cause === null || cause === void 0 ? void 0 : cause.stack) errorDetails += `
${cause.stack}`;
      } else {
        var _fetchError$stack;
        errorDetails = (_fetchError$stack = fetchError === null || fetchError === void 0 ? void 0 : fetchError.stack) !== null && _fetchError$stack !== void 0 ? _fetchError$stack : "";
      }
      const urlLength = this.url.toString().length;
      if ((fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) === "AbortError" || (fetchError === null || fetchError === void 0 ? void 0 : fetchError.code) === "ABORT_ERR") {
        code = "";
        hint = "Request was aborted (timeout or manual cancellation)";
        if (urlLength > this.urlLengthLimit) hint += `. Note: Your request URL is ${urlLength} characters, which may exceed server limits. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [many IDs])), consider using an RPC function to pass values server-side.`;
      } else if ((cause === null || cause === void 0 ? void 0 : cause.name) === "HeadersOverflowError" || (cause === null || cause === void 0 ? void 0 : cause.code) === "UND_ERR_HEADERS_OVERFLOW") {
        code = "";
        hint = "HTTP headers exceeded server limits (typically 16KB)";
        if (urlLength > this.urlLengthLimit) hint += `. Your request URL is ${urlLength} characters. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead.`;
      }
      return {
        error: {
          message: `${(_fetchError$name2 = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name2 !== void 0 ? _fetchError$name2 : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`,
          details: errorDetails,
          hint,
          code
        },
        data: null,
        count: null,
        status: 0,
        statusText: ""
      };
    });
    return res.then(onfulfilled, onrejected);
  }
  /**
  * Override the type of the returned `data`.
  *
  * @typeParam NewResult - The new result type to override with
  * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
  */
  returns() {
    return this;
  }
  /**
  * Override the type of the returned `data` field in the response.
  *
  * @typeParam NewResult - The new type to cast the response data to
  * @typeParam Options - Optional type configuration (defaults to { merge: true })
  * @typeParam Options.merge - When true, merges the new type with existing return type. When false, replaces the existing types entirely (defaults to true)
  * @example
  * ```typescript
  * // Merge with existing types (default behavior)
  * const query = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ custom_field: string }>()
  *
  * // Replace existing types completely
  * const replaceQuery = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ id: number; name: string }, { merge: false }>()
  * ```
  * @returns A PostgrestBuilder instance with the new type
  */
  overrideTypes() {
    return this;
  }
};
var PostgrestTransformBuilder = class extends PostgrestBuilder {
  /**
  * Perform a SELECT on the query result.
  *
  * By default, `.insert()`, `.update()`, `.upsert()`, and `.delete()` do not
  * return modified rows. By calling this method, modified rows are returned in
  * `data`.
  *
  * @param columns - The columns to retrieve, separated by commas
  */
  select(columns) {
    let quoted = false;
    const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
      if (/\s/.test(c) && !quoted) return "";
      if (c === '"') quoted = !quoted;
      return c;
    }).join("");
    this.url.searchParams.set("select", cleanedColumns);
    this.headers.append("Prefer", "return=representation");
    return this;
  }
  /**
  * Order the query result by `column`.
  *
  * You can call this method multiple times to order by multiple columns.
  *
  * You can order referenced tables, but it only affects the ordering of the
  * parent table if you use `!inner` in the query.
  *
  * @param column - The column to order by
  * @param options - Named parameters
  * @param options.ascending - If `true`, the result will be in ascending order
  * @param options.nullsFirst - If `true`, `null`s appear first. If `false`,
  * `null`s appear last.
  * @param options.referencedTable - Set this to order a referenced table by
  * its columns
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  */
  order(column, { ascending = true, nullsFirst, foreignTable, referencedTable = foreignTable } = {}) {
    const key = referencedTable ? `${referencedTable}.order` : "order";
    const existingOrder = this.url.searchParams.get(key);
    this.url.searchParams.set(key, `${existingOrder ? `${existingOrder},` : ""}${column}.${ascending ? "asc" : "desc"}${nullsFirst === void 0 ? "" : nullsFirst ? ".nullsfirst" : ".nullslast"}`);
    return this;
  }
  /**
  * Limit the query result by `count`.
  *
  * @param count - The maximum number of rows to return
  * @param options - Named parameters
  * @param options.referencedTable - Set this to limit rows of referenced
  * tables instead of the parent table
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  */
  limit(count, { foreignTable, referencedTable = foreignTable } = {}) {
    const key = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
    this.url.searchParams.set(key, `${count}`);
    return this;
  }
  /**
  * Limit the query result by starting at an offset `from` and ending at the offset `to`.
  * Only records within this range are returned.
  * This respects the query order and if there is no order clause the range could behave unexpectedly.
  * The `from` and `to` values are 0-based and inclusive: `range(1, 3)` will include the second, third
  * and fourth rows of the query.
  *
  * @param from - The starting index from which to limit the result
  * @param to - The last index to which to limit the result
  * @param options - Named parameters
  * @param options.referencedTable - Set this to limit rows of referenced
  * tables instead of the parent table
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  */
  range(from, to, { foreignTable, referencedTable = foreignTable } = {}) {
    const keyOffset = typeof referencedTable === "undefined" ? "offset" : `${referencedTable}.offset`;
    const keyLimit = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
    this.url.searchParams.set(keyOffset, `${from}`);
    this.url.searchParams.set(keyLimit, `${to - from + 1}`);
    return this;
  }
  /**
  * Set the AbortSignal for the fetch request.
  *
  * @param signal - The AbortSignal to use for the fetch request
  */
  abortSignal(signal) {
    this.signal = signal;
    return this;
  }
  /**
  * Return `data` as a single object instead of an array of objects.
  *
  * Query result must be one row (e.g. using `.limit(1)`), otherwise this
  * returns an error.
  */
  single() {
    this.headers.set("Accept", "application/vnd.pgrst.object+json");
    return this;
  }
  /**
  * Return `data` as a single object instead of an array of objects.
  *
  * Query result must be zero or one row (e.g. using `.limit(1)`), otherwise
  * this returns an error.
  */
  maybeSingle() {
    if (this.method === "GET") this.headers.set("Accept", "application/json");
    else this.headers.set("Accept", "application/vnd.pgrst.object+json");
    this.isMaybeSingle = true;
    return this;
  }
  /**
  * Return `data` as a string in CSV format.
  */
  csv() {
    this.headers.set("Accept", "text/csv");
    return this;
  }
  /**
  * Return `data` as an object in [GeoJSON](https://geojson.org) format.
  */
  geojson() {
    this.headers.set("Accept", "application/geo+json");
    return this;
  }
  /**
  * Return `data` as the EXPLAIN plan for the query.
  *
  * You need to enable the
  * [db_plan_enabled](https://supabase.com/docs/guides/database/debugging-performance#enabling-explain)
  * setting before using this method.
  *
  * @param options - Named parameters
  *
  * @param options.analyze - If `true`, the query will be executed and the
  * actual run time will be returned
  *
  * @param options.verbose - If `true`, the query identifier will be returned
  * and `data` will include the output columns of the query
  *
  * @param options.settings - If `true`, include information on configuration
  * parameters that affect query planning
  *
  * @param options.buffers - If `true`, include information on buffer usage
  *
  * @param options.wal - If `true`, include information on WAL record generation
  *
  * @param options.format - The format of the output, can be `"text"` (default)
  * or `"json"`
  */
  explain({ analyze = false, verbose = false, settings = false, buffers = false, wal = false, format = "text" } = {}) {
    var _this$headers$get;
    const options = [
      analyze ? "analyze" : null,
      verbose ? "verbose" : null,
      settings ? "settings" : null,
      buffers ? "buffers" : null,
      wal ? "wal" : null
    ].filter(Boolean).join("|");
    const forMediatype = (_this$headers$get = this.headers.get("Accept")) !== null && _this$headers$get !== void 0 ? _this$headers$get : "application/json";
    this.headers.set("Accept", `application/vnd.pgrst.plan+${format}; for="${forMediatype}"; options=${options};`);
    if (format === "json") return this;
    else return this;
  }
  /**
  * Rollback the query.
  *
  * `data` will still be returned, but the query is not committed.
  */
  rollback() {
    this.headers.append("Prefer", "tx=rollback");
    return this;
  }
  /**
  * Override the type of the returned `data`.
  *
  * @typeParam NewResult - The new result type to override with
  * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
  */
  returns() {
    return this;
  }
  /**
  * Set the maximum number of rows that can be affected by the query.
  * Only available in PostgREST v13+ and only works with PATCH and DELETE methods.
  *
  * @param value - The maximum number of rows that can be affected
  */
  maxAffected(value) {
    this.headers.append("Prefer", "handling=strict");
    this.headers.append("Prefer", `max-affected=${value}`);
    return this;
  }
};
var PostgrestReservedCharsRegexp = /* @__PURE__ */ new RegExp("[,()]");
var PostgrestFilterBuilder = class extends PostgrestTransformBuilder {
  /**
  * Match only rows where `column` is equal to `value`.
  *
  * To check if the value of `column` is NULL, you should use `.is()` instead.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  eq(column, value) {
    this.url.searchParams.append(column, `eq.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` is not equal to `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  neq(column, value) {
    this.url.searchParams.append(column, `neq.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` is greater than `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  gt(column, value) {
    this.url.searchParams.append(column, `gt.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` is greater than or equal to `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  gte(column, value) {
    this.url.searchParams.append(column, `gte.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` is less than `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  lt(column, value) {
    this.url.searchParams.append(column, `lt.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` is less than or equal to `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  lte(column, value) {
    this.url.searchParams.append(column, `lte.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` matches `pattern` case-sensitively.
  *
  * @param column - The column to filter on
  * @param pattern - The pattern to match with
  */
  like(column, pattern) {
    this.url.searchParams.append(column, `like.${pattern}`);
    return this;
  }
  /**
  * Match only rows where `column` matches all of `patterns` case-sensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  likeAllOf(column, patterns) {
    this.url.searchParams.append(column, `like(all).{${patterns.join(",")}}`);
    return this;
  }
  /**
  * Match only rows where `column` matches any of `patterns` case-sensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  likeAnyOf(column, patterns) {
    this.url.searchParams.append(column, `like(any).{${patterns.join(",")}}`);
    return this;
  }
  /**
  * Match only rows where `column` matches `pattern` case-insensitively.
  *
  * @param column - The column to filter on
  * @param pattern - The pattern to match with
  */
  ilike(column, pattern) {
    this.url.searchParams.append(column, `ilike.${pattern}`);
    return this;
  }
  /**
  * Match only rows where `column` matches all of `patterns` case-insensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  ilikeAllOf(column, patterns) {
    this.url.searchParams.append(column, `ilike(all).{${patterns.join(",")}}`);
    return this;
  }
  /**
  * Match only rows where `column` matches any of `patterns` case-insensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  ilikeAnyOf(column, patterns) {
    this.url.searchParams.append(column, `ilike(any).{${patterns.join(",")}}`);
    return this;
  }
  /**
  * Match only rows where `column` matches the PostgreSQL regex `pattern`
  * case-sensitively (using the `~` operator).
  *
  * @param column - The column to filter on
  * @param pattern - The PostgreSQL regular expression pattern to match with
  */
  regexMatch(column, pattern) {
    this.url.searchParams.append(column, `match.${pattern}`);
    return this;
  }
  /**
  * Match only rows where `column` matches the PostgreSQL regex `pattern`
  * case-insensitively (using the `~*` operator).
  *
  * @param column - The column to filter on
  * @param pattern - The PostgreSQL regular expression pattern to match with
  */
  regexIMatch(column, pattern) {
    this.url.searchParams.append(column, `imatch.${pattern}`);
    return this;
  }
  /**
  * Match only rows where `column` IS `value`.
  *
  * For non-boolean columns, this is only relevant for checking if the value of
  * `column` is NULL by setting `value` to `null`.
  *
  * For boolean columns, you can also set `value` to `true` or `false` and it
  * will behave the same way as `.eq()`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  is(column, value) {
    this.url.searchParams.append(column, `is.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` IS DISTINCT FROM `value`.
  *
  * Unlike `.neq()`, this treats `NULL` as a comparable value. Two `NULL` values
  * are considered equal (not distinct), and comparing `NULL` with any non-NULL
  * value returns true (distinct).
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  isDistinct(column, value) {
    this.url.searchParams.append(column, `isdistinct.${value}`);
    return this;
  }
  /**
  * Match only rows where `column` is included in the `values` array.
  *
  * @param column - The column to filter on
  * @param values - The values array to filter with
  */
  in(column, values) {
    const cleanedValues = Array.from(new Set(values)).map((s) => {
      if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
      else return `${s}`;
    }).join(",");
    this.url.searchParams.append(column, `in.(${cleanedValues})`);
    return this;
  }
  /**
  * Match only rows where `column` is NOT included in the `values` array.
  *
  * @param column - The column to filter on
  * @param values - The values array to filter with
  */
  notIn(column, values) {
    const cleanedValues = Array.from(new Set(values)).map((s) => {
      if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
      else return `${s}`;
    }).join(",");
    this.url.searchParams.append(column, `not.in.(${cleanedValues})`);
    return this;
  }
  /**
  * Only relevant for jsonb, array, and range columns. Match only rows where
  * `column` contains every element appearing in `value`.
  *
  * @param column - The jsonb, array, or range column to filter on
  * @param value - The jsonb, array, or range value to filter with
  */
  contains(column, value) {
    if (typeof value === "string") this.url.searchParams.append(column, `cs.${value}`);
    else if (Array.isArray(value)) this.url.searchParams.append(column, `cs.{${value.join(",")}}`);
    else this.url.searchParams.append(column, `cs.${JSON.stringify(value)}`);
    return this;
  }
  /**
  * Only relevant for jsonb, array, and range columns. Match only rows where
  * every element appearing in `column` is contained by `value`.
  *
  * @param column - The jsonb, array, or range column to filter on
  * @param value - The jsonb, array, or range value to filter with
  */
  containedBy(column, value) {
    if (typeof value === "string") this.url.searchParams.append(column, `cd.${value}`);
    else if (Array.isArray(value)) this.url.searchParams.append(column, `cd.{${value.join(",")}}`);
    else this.url.searchParams.append(column, `cd.${JSON.stringify(value)}`);
    return this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is greater than any element in `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeGt(column, range) {
    this.url.searchParams.append(column, `sr.${range}`);
    return this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is either contained in `range` or greater than any element in
  * `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeGte(column, range) {
    this.url.searchParams.append(column, `nxl.${range}`);
    return this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is less than any element in `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeLt(column, range) {
    this.url.searchParams.append(column, `sl.${range}`);
    return this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is either contained in `range` or less than any element in
  * `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeLte(column, range) {
    this.url.searchParams.append(column, `nxr.${range}`);
    return this;
  }
  /**
  * Only relevant for range columns. Match only rows where `column` is
  * mutually exclusive to `range` and there can be no element between the two
  * ranges.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeAdjacent(column, range) {
    this.url.searchParams.append(column, `adj.${range}`);
    return this;
  }
  /**
  * Only relevant for array and range columns. Match only rows where
  * `column` and `value` have an element in common.
  *
  * @param column - The array or range column to filter on
  * @param value - The array or range value to filter with
  */
  overlaps(column, value) {
    if (typeof value === "string") this.url.searchParams.append(column, `ov.${value}`);
    else this.url.searchParams.append(column, `ov.{${value.join(",")}}`);
    return this;
  }
  /**
  * Only relevant for text and tsvector columns. Match only rows where
  * `column` matches the query string in `query`.
  *
  * @param column - The text or tsvector column to filter on
  * @param query - The query text to match with
  * @param options - Named parameters
  * @param options.config - The text search configuration to use
  * @param options.type - Change how the `query` text is interpreted
  */
  textSearch(column, query, { config, type } = {}) {
    let typePart = "";
    if (type === "plain") typePart = "pl";
    else if (type === "phrase") typePart = "ph";
    else if (type === "websearch") typePart = "w";
    const configPart = config === void 0 ? "" : `(${config})`;
    this.url.searchParams.append(column, `${typePart}fts${configPart}.${query}`);
    return this;
  }
  /**
  * Match only rows where each column in `query` keys is equal to its
  * associated value. Shorthand for multiple `.eq()`s.
  *
  * @param query - The object to filter with, with column names as keys mapped
  * to their filter values
  */
  match(query) {
    Object.entries(query).forEach(([column, value]) => {
      this.url.searchParams.append(column, `eq.${value}`);
    });
    return this;
  }
  /**
  * Match only rows which doesn't satisfy the filter.
  *
  * Unlike most filters, `opearator` and `value` are used as-is and need to
  * follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure they are properly sanitized.
  *
  * @param column - The column to filter on
  * @param operator - The operator to be negated to filter with, following
  * PostgREST syntax
  * @param value - The value to filter with, following PostgREST syntax
  */
  not(column, operator, value) {
    this.url.searchParams.append(column, `not.${operator}.${value}`);
    return this;
  }
  /**
  * Match only rows which satisfy at least one of the filters.
  *
  * Unlike most filters, `filters` is used as-is and needs to follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure it's properly sanitized.
  *
  * It's currently not possible to do an `.or()` filter across multiple tables.
  *
  * @param filters - The filters to use, following PostgREST syntax
  * @param options - Named parameters
  * @param options.referencedTable - Set this to filter on referenced tables
  * instead of the parent table
  * @param options.foreignTable - Deprecated, use `referencedTable` instead
  */
  or(filters, { foreignTable, referencedTable = foreignTable } = {}) {
    const key = referencedTable ? `${referencedTable}.or` : "or";
    this.url.searchParams.append(key, `(${filters})`);
    return this;
  }
  /**
  * Match only rows which satisfy the filter. This is an escape hatch - you
  * should use the specific filter methods wherever possible.
  *
  * Unlike most filters, `opearator` and `value` are used as-is and need to
  * follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure they are properly sanitized.
  *
  * @param column - The column to filter on
  * @param operator - The operator to filter with, following PostgREST syntax
  * @param value - The value to filter with, following PostgREST syntax
  */
  filter(column, operator, value) {
    this.url.searchParams.append(column, `${operator}.${value}`);
    return this;
  }
};
var PostgrestQueryBuilder = class {
  /**
  * Creates a query builder scoped to a Postgres table or view.
  *
  * @example
  * ```ts
  * import PostgrestQueryBuilder from '@supabase/postgrest-js'
  *
  * const query = new PostgrestQueryBuilder(
  *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
  *   { headers: { apikey: 'public-anon-key' } }
  * )
  * ```
  */
  constructor(url, { headers = {}, schema, fetch: fetch$1, urlLengthLimit = 8e3 }) {
    this.url = url;
    this.headers = new Headers(headers);
    this.schema = schema;
    this.fetch = fetch$1;
    this.urlLengthLimit = urlLengthLimit;
  }
  /**
  * Clone URL and headers to prevent shared state between operations.
  */
  cloneRequestState() {
    return {
      url: new URL(this.url.toString()),
      headers: new Headers(this.headers)
    };
  }
  /**
  * Perform a SELECT query on the table or view.
  *
  * @param columns - The columns to retrieve, separated by commas. Columns can be renamed when returned with `customName:columnName`
  *
  * @param options - Named parameters
  *
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  *
  * @param options.count - Count algorithm to use to count rows in the table or view.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @remarks
  * When using `count` with `.range()` or `.limit()`, the returned `count` is the total number of rows
  * that match your filters, not the number of rows in the current page. Use this to build pagination UI.
  */
  select(columns, options) {
    const { head: head2 = false, count } = options !== null && options !== void 0 ? options : {};
    const method = head2 ? "HEAD" : "GET";
    let quoted = false;
    const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
      if (/\s/.test(c) && !quoted) return "";
      if (c === '"') quoted = !quoted;
      return c;
    }).join("");
    const { url, headers } = this.cloneRequestState();
    url.searchParams.set("select", cleanedColumns);
    if (count) headers.append("Prefer", `count=${count}`);
    return new PostgrestFilterBuilder({
      method,
      url,
      headers,
      schema: this.schema,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform an INSERT into the table or view.
  *
  * By default, inserted rows are not returned. To return it, chain the call
  * with `.select()`.
  *
  * @param values - The values to insert. Pass an object to insert a single row
  * or an array to insert multiple rows.
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count inserted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @param options.defaultToNull - Make missing fields default to `null`.
  * Otherwise, use the default value for the column. Only applies for bulk
  * inserts.
  */
  insert(values, { count, defaultToNull = true } = {}) {
    var _this$fetch;
    const method = "POST";
    const { url, headers } = this.cloneRequestState();
    if (count) headers.append("Prefer", `count=${count}`);
    if (!defaultToNull) headers.append("Prefer", `missing=default`);
    if (Array.isArray(values)) {
      const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
      if (columns.length > 0) {
        const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
        url.searchParams.set("columns", uniqueColumns.join(","));
      }
    }
    return new PostgrestFilterBuilder({
      method,
      url,
      headers,
      schema: this.schema,
      body: values,
      fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform an UPSERT on the table or view. Depending on the column(s) passed
  * to `onConflict`, `.upsert()` allows you to perform the equivalent of
  * `.insert()` if a row with the corresponding `onConflict` columns doesn't
  * exist, or if it does exist, perform an alternative action depending on
  * `ignoreDuplicates`.
  *
  * By default, upserted rows are not returned. To return it, chain the call
  * with `.select()`.
  *
  * @param values - The values to upsert with. Pass an object to upsert a
  * single row or an array to upsert multiple rows.
  *
  * @param options - Named parameters
  *
  * @param options.onConflict - Comma-separated UNIQUE column(s) to specify how
  * duplicate rows are determined. Two rows are duplicates if all the
  * `onConflict` columns are equal.
  *
  * @param options.ignoreDuplicates - If `true`, duplicate rows are ignored. If
  * `false`, duplicate rows are merged with existing rows.
  *
  * @param options.count - Count algorithm to use to count upserted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @param options.defaultToNull - Make missing fields default to `null`.
  * Otherwise, use the default value for the column. This only applies when
  * inserting new rows, not when merging with existing rows under
  * `ignoreDuplicates: false`. This also only applies when doing bulk upserts.
  *
  * @example Upsert a single row using a unique key
  * ```ts
  * // Upserting a single row, overwriting based on the 'username' unique column
  * const { data, error } = await supabase
  *   .from('users')
  *   .upsert({ username: 'supabot' }, { onConflict: 'username' })
  *
  * // Example response:
  * // {
  * //   data: [
  * //     { id: 4, message: 'bar', username: 'supabot' }
  * //   ],
  * //   error: null
  * // }
  * ```
  *
  * @example Upsert with conflict resolution and exact row counting
  * ```ts
  * // Upserting and returning exact count
  * const { data, error, count } = await supabase
  *   .from('users')
  *   .upsert(
  *     {
  *       id: 3,
  *       message: 'foo',
  *       username: 'supabot'
  *     },
  *     {
  *       onConflict: 'username',
  *       count: 'exact'
  *     }
  *   )
  *
  * // Example response:
  * // {
  * //   data: [
  * //     {
  * //       id: 42,
  * //       handle: "saoirse",
  * //       display_name: "Saoirse"
  * //     }
  * //   ],
  * //   count: 1,
  * //   error: null
  * // }
  * ```
  */
  upsert(values, { onConflict, ignoreDuplicates = false, count, defaultToNull = true } = {}) {
    var _this$fetch2;
    const method = "POST";
    const { url, headers } = this.cloneRequestState();
    headers.append("Prefer", `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates`);
    if (onConflict !== void 0) url.searchParams.set("on_conflict", onConflict);
    if (count) headers.append("Prefer", `count=${count}`);
    if (!defaultToNull) headers.append("Prefer", "missing=default");
    if (Array.isArray(values)) {
      const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
      if (columns.length > 0) {
        const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
        url.searchParams.set("columns", uniqueColumns.join(","));
      }
    }
    return new PostgrestFilterBuilder({
      method,
      url,
      headers,
      schema: this.schema,
      body: values,
      fetch: (_this$fetch2 = this.fetch) !== null && _this$fetch2 !== void 0 ? _this$fetch2 : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform an UPDATE on the table or view.
  *
  * By default, updated rows are not returned. To return it, chain the call
  * with `.select()` after filters.
  *
  * @param values - The values to update with
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count updated rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  */
  update(values, { count } = {}) {
    var _this$fetch3;
    const method = "PATCH";
    const { url, headers } = this.cloneRequestState();
    if (count) headers.append("Prefer", `count=${count}`);
    return new PostgrestFilterBuilder({
      method,
      url,
      headers,
      schema: this.schema,
      body: values,
      fetch: (_this$fetch3 = this.fetch) !== null && _this$fetch3 !== void 0 ? _this$fetch3 : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform a DELETE on the table or view.
  *
  * By default, deleted rows are not returned. To return it, chain the call
  * with `.select()` after filters.
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count deleted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  */
  delete({ count } = {}) {
    var _this$fetch4;
    const method = "DELETE";
    const { url, headers } = this.cloneRequestState();
    if (count) headers.append("Prefer", `count=${count}`);
    return new PostgrestFilterBuilder({
      method,
      url,
      headers,
      schema: this.schema,
      fetch: (_this$fetch4 = this.fetch) !== null && _this$fetch4 !== void 0 ? _this$fetch4 : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
};
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
    return typeof o$1;
  } : function(o$1) {
    return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
  }, _typeof(o);
}
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys2(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r$1) {
      return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys2(Object(t), true).forEach(function(r$1) {
      _defineProperty(e, r$1, t[r$1]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r$1) {
      Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
    });
  }
  return e;
}
var PostgrestClient = class PostgrestClient2 {
  /**
  * Creates a PostgREST client.
  *
  * @param url - URL of the PostgREST endpoint
  * @param options - Named parameters
  * @param options.headers - Custom headers
  * @param options.schema - Postgres schema to switch to
  * @param options.fetch - Custom fetch
  * @param options.timeout - Optional timeout in milliseconds for all requests. When set, requests will automatically abort after this duration to prevent indefinite hangs.
  * @param options.urlLengthLimit - Maximum URL length in characters before warnings/errors are triggered. Defaults to 8000.
  * @example
  * ```ts
  * import PostgrestClient from '@supabase/postgrest-js'
  *
  * const postgrest = new PostgrestClient('https://xyzcompany.supabase.co/rest/v1', {
  *   headers: { apikey: 'public-anon-key' },
  *   schema: 'public',
  *   timeout: 30000, // 30 second timeout
  * })
  * ```
  */
  constructor(url, { headers = {}, schema, fetch: fetch$1, timeout, urlLengthLimit = 8e3 } = {}) {
    this.url = url;
    this.headers = new Headers(headers);
    this.schemaName = schema;
    this.urlLengthLimit = urlLengthLimit;
    const originalFetch = fetch$1 !== null && fetch$1 !== void 0 ? fetch$1 : globalThis.fetch;
    if (timeout !== void 0 && timeout > 0) this.fetch = (input, init) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const existingSignal = init === null || init === void 0 ? void 0 : init.signal;
      if (existingSignal) {
        if (existingSignal.aborted) {
          clearTimeout(timeoutId);
          return originalFetch(input, init);
        }
        const abortHandler = () => {
          clearTimeout(timeoutId);
          controller.abort();
        };
        existingSignal.addEventListener("abort", abortHandler, { once: true });
        return originalFetch(input, _objectSpread2(_objectSpread2({}, init), {}, { signal: controller.signal })).finally(() => {
          clearTimeout(timeoutId);
          existingSignal.removeEventListener("abort", abortHandler);
        });
      }
      return originalFetch(input, _objectSpread2(_objectSpread2({}, init), {}, { signal: controller.signal })).finally(() => clearTimeout(timeoutId));
    };
    else this.fetch = originalFetch;
  }
  /**
  * Perform a query on a table or a view.
  *
  * @param relation - The table or view name to query
  */
  from(relation) {
    if (!relation || typeof relation !== "string" || relation.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
    return new PostgrestQueryBuilder(new URL(`${this.url}/${relation}`), {
      headers: new Headers(this.headers),
      schema: this.schemaName,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Select a schema to query or perform an function (rpc) call.
  *
  * The schema needs to be on the list of exposed schemas inside Supabase.
  *
  * @param schema - The schema to query
  */
  schema(schema) {
    return new PostgrestClient2(this.url, {
      headers: this.headers,
      schema,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform a function call.
  *
  * @param fn - The function name to call
  * @param args - The arguments to pass to the function call
  * @param options - Named parameters
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  * @param options.get - When set to `true`, the function will be called with
  * read-only access mode.
  * @param options.count - Count algorithm to use to count rows returned by the
  * function. Only applicable for [set-returning
  * functions](https://www.postgresql.org/docs/current/functions-srf.html).
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @example
  * ```ts
  * // For cross-schema functions where type inference fails, use overrideTypes:
  * const { data } = await supabase
  *   .schema('schema_b')
  *   .rpc('function_a', {})
  *   .overrideTypes<{ id: string; user_id: string }[]>()
  * ```
  */
  rpc(fn, args = {}, { head: head2 = false, get: get2 = false, count } = {}) {
    var _this$fetch;
    let method;
    const url = new URL(`${this.url}/rpc/${fn}`);
    let body;
    const _isObject = (v) => v !== null && typeof v === "object" && (!Array.isArray(v) || v.some(_isObject));
    const _hasObjectArg = head2 && Object.values(args).some(_isObject);
    if (_hasObjectArg) {
      method = "POST";
      body = args;
    } else if (head2 || get2) {
      method = head2 ? "HEAD" : "GET";
      Object.entries(args).filter(([_, value]) => value !== void 0).map(([name, value]) => [name, Array.isArray(value) ? `{${value.join(",")}}` : `${value}`]).forEach(([name, value]) => {
        url.searchParams.append(name, value);
      });
    } else {
      method = "POST";
      body = args;
    }
    const headers = new Headers(this.headers);
    if (_hasObjectArg) headers.set("Prefer", count ? `count=${count},return=minimal` : "return=minimal");
    else if (count) headers.set("Prefer", `count=${count}`);
    return new PostgrestFilterBuilder({
      method,
      url,
      headers,
      schema: this.schemaName,
      body,
      fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
};

// ../../node_modules/@supabase/supabase-js/dist/index.mjs
var import_realtime_js = __toESM(require_main2(), 1);

// ../../node_modules/iceberg-js/dist/index.mjs
var IcebergError = class extends Error {
  constructor(message, opts) {
    super(message);
    this.name = "IcebergError";
    this.status = opts.status;
    this.icebergType = opts.icebergType;
    this.icebergCode = opts.icebergCode;
    this.details = opts.details;
    this.isCommitStateUnknown = opts.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(opts.status) && opts.icebergType?.includes("CommitState") === true;
  }
  /**
   * Returns true if the error is a 404 Not Found error.
   */
  isNotFound() {
    return this.status === 404;
  }
  /**
   * Returns true if the error is a 409 Conflict error.
   */
  isConflict() {
    return this.status === 409;
  }
  /**
   * Returns true if the error is a 419 Authentication Timeout error.
   */
  isAuthenticationTimeout() {
    return this.status === 419;
  }
};
function buildUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== void 0) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}
async function buildAuthHeaders(auth) {
  if (!auth || auth.type === "none") {
    return {};
  }
  if (auth.type === "bearer") {
    return { Authorization: `Bearer ${auth.token}` };
  }
  if (auth.type === "header") {
    return { [auth.name]: auth.value };
  }
  if (auth.type === "custom") {
    return await auth.getHeaders();
  }
  return {};
}
function createFetchClient(options) {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  return {
    async request({
      method,
      path,
      query,
      body,
      headers
    }) {
      const url = buildUrl(options.baseUrl, path, query);
      const authHeaders = await buildAuthHeaders(options.auth);
      const res = await fetchFn(url, {
        method,
        headers: {
          ...body ? { "Content-Type": "application/json" } : {},
          ...authHeaders,
          ...headers
        },
        body: body ? JSON.stringify(body) : void 0
      });
      const text = await res.text();
      const isJson = (res.headers.get("content-type") || "").includes("application/json");
      const data = isJson && text ? JSON.parse(text) : text;
      if (!res.ok) {
        const errBody = isJson ? data : void 0;
        const errorDetail = errBody?.error;
        throw new IcebergError(
          errorDetail?.message ?? `Request failed with status ${res.status}`,
          {
            status: res.status,
            icebergType: errorDetail?.type,
            icebergCode: errorDetail?.code,
            details: errBody
          }
        );
      }
      return { status: res.status, headers: res.headers, data };
    }
  };
}
function namespaceToPath(namespace) {
  return namespace.join("");
}
var NamespaceOperations = class {
  constructor(client, prefix = "") {
    this.client = client;
    this.prefix = prefix;
  }
  async listNamespaces(parent) {
    const query = parent ? { parent: namespaceToPath(parent.namespace) } : void 0;
    const response = await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces`,
      query
    });
    return response.data.namespaces.map((ns) => ({ namespace: ns }));
  }
  async createNamespace(id, metadata) {
    const request = {
      namespace: id.namespace,
      properties: metadata?.properties
    };
    const response = await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces`,
      body: request
    });
    return response.data;
  }
  async dropNamespace(id) {
    await this.client.request({
      method: "DELETE",
      path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
    });
  }
  async loadNamespaceMetadata(id) {
    const response = await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
    });
    return {
      properties: response.data.properties
    };
  }
  async namespaceExists(id) {
    try {
      await this.client.request({
        method: "HEAD",
        path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
      });
      return true;
    } catch (error) {
      if (error instanceof IcebergError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }
  async createNamespaceIfNotExists(id, metadata) {
    try {
      return await this.createNamespace(id, metadata);
    } catch (error) {
      if (error instanceof IcebergError && error.status === 409) {
        return;
      }
      throw error;
    }
  }
};
function namespaceToPath2(namespace) {
  return namespace.join("");
}
var TableOperations = class {
  constructor(client, prefix = "", accessDelegation) {
    this.client = client;
    this.prefix = prefix;
    this.accessDelegation = accessDelegation;
  }
  async listTables(namespace) {
    const response = await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`
    });
    return response.data.identifiers;
  }
  async createTable(namespace, request) {
    const headers = {};
    if (this.accessDelegation) {
      headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
    }
    const response = await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`,
      body: request,
      headers
    });
    return response.data.metadata;
  }
  async updateTable(id, request) {
    const response = await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
      body: request
    });
    return {
      "metadata-location": response.data["metadata-location"],
      metadata: response.data.metadata
    };
  }
  async dropTable(id, options) {
    await this.client.request({
      method: "DELETE",
      path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
      query: { purgeRequested: String(options?.purge ?? false) }
    });
  }
  async loadTable(id) {
    const headers = {};
    if (this.accessDelegation) {
      headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
    }
    const response = await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
      headers
    });
    return response.data.metadata;
  }
  async tableExists(id) {
    const headers = {};
    if (this.accessDelegation) {
      headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
    }
    try {
      await this.client.request({
        method: "HEAD",
        path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
        headers
      });
      return true;
    } catch (error) {
      if (error instanceof IcebergError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }
  async createTableIfNotExists(namespace, request) {
    try {
      return await this.createTable(namespace, request);
    } catch (error) {
      if (error instanceof IcebergError && error.status === 409) {
        return await this.loadTable({ namespace: namespace.namespace, name: request.name });
      }
      throw error;
    }
  }
};
var IcebergRestCatalog = class {
  /**
   * Creates a new Iceberg REST Catalog client.
   *
   * @param options - Configuration options for the catalog client
   */
  constructor(options) {
    let prefix = "v1";
    if (options.catalogName) {
      prefix += `/${options.catalogName}`;
    }
    const baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
    this.client = createFetchClient({
      baseUrl,
      auth: options.auth,
      fetchImpl: options.fetch
    });
    this.accessDelegation = options.accessDelegation?.join(",");
    this.namespaceOps = new NamespaceOperations(this.client, prefix);
    this.tableOps = new TableOperations(this.client, prefix, this.accessDelegation);
  }
  /**
   * Lists all namespaces in the catalog.
   *
   * @param parent - Optional parent namespace to list children under
   * @returns Array of namespace identifiers
   *
   * @example
   * ```typescript
   * // List all top-level namespaces
   * const namespaces = await catalog.listNamespaces();
   *
   * // List namespaces under a parent
   * const children = await catalog.listNamespaces({ namespace: ['analytics'] });
   * ```
   */
  async listNamespaces(parent) {
    return this.namespaceOps.listNamespaces(parent);
  }
  /**
   * Creates a new namespace in the catalog.
   *
   * @param id - Namespace identifier to create
   * @param metadata - Optional metadata properties for the namespace
   * @returns Response containing the created namespace and its properties
   *
   * @example
   * ```typescript
   * const response = await catalog.createNamespace(
   *   { namespace: ['analytics'] },
   *   { properties: { owner: 'data-team' } }
   * );
   * console.log(response.namespace); // ['analytics']
   * console.log(response.properties); // { owner: 'data-team', ... }
   * ```
   */
  async createNamespace(id, metadata) {
    return this.namespaceOps.createNamespace(id, metadata);
  }
  /**
   * Drops a namespace from the catalog.
   *
   * The namespace must be empty (contain no tables) before it can be dropped.
   *
   * @param id - Namespace identifier to drop
   *
   * @example
   * ```typescript
   * await catalog.dropNamespace({ namespace: ['analytics'] });
   * ```
   */
  async dropNamespace(id) {
    await this.namespaceOps.dropNamespace(id);
  }
  /**
   * Loads metadata for a namespace.
   *
   * @param id - Namespace identifier to load
   * @returns Namespace metadata including properties
   *
   * @example
   * ```typescript
   * const metadata = await catalog.loadNamespaceMetadata({ namespace: ['analytics'] });
   * console.log(metadata.properties);
   * ```
   */
  async loadNamespaceMetadata(id) {
    return this.namespaceOps.loadNamespaceMetadata(id);
  }
  /**
   * Lists all tables in a namespace.
   *
   * @param namespace - Namespace identifier to list tables from
   * @returns Array of table identifiers
   *
   * @example
   * ```typescript
   * const tables = await catalog.listTables({ namespace: ['analytics'] });
   * console.log(tables); // [{ namespace: ['analytics'], name: 'events' }, ...]
   * ```
   */
  async listTables(namespace) {
    return this.tableOps.listTables(namespace);
  }
  /**
   * Creates a new table in the catalog.
   *
   * @param namespace - Namespace to create the table in
   * @param request - Table creation request including name, schema, partition spec, etc.
   * @returns Table metadata for the created table
   *
   * @example
   * ```typescript
   * const metadata = await catalog.createTable(
   *   { namespace: ['analytics'] },
   *   {
   *     name: 'events',
   *     schema: {
   *       type: 'struct',
   *       fields: [
   *         { id: 1, name: 'id', type: 'long', required: true },
   *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
   *       ],
   *       'schema-id': 0
   *     },
   *     'partition-spec': {
   *       'spec-id': 0,
   *       fields: [
   *         { source_id: 2, field_id: 1000, name: 'ts_day', transform: 'day' }
   *       ]
   *     }
   *   }
   * );
   * ```
   */
  async createTable(namespace, request) {
    return this.tableOps.createTable(namespace, request);
  }
  /**
   * Updates an existing table's metadata.
   *
   * Can update the schema, partition spec, or properties of a table.
   *
   * @param id - Table identifier to update
   * @param request - Update request with fields to modify
   * @returns Response containing the metadata location and updated table metadata
   *
   * @example
   * ```typescript
   * const response = await catalog.updateTable(
   *   { namespace: ['analytics'], name: 'events' },
   *   {
   *     properties: { 'read.split.target-size': '134217728' }
   *   }
   * );
   * console.log(response['metadata-location']); // s3://...
   * console.log(response.metadata); // TableMetadata object
   * ```
   */
  async updateTable(id, request) {
    return this.tableOps.updateTable(id, request);
  }
  /**
   * Drops a table from the catalog.
   *
   * @param id - Table identifier to drop
   *
   * @example
   * ```typescript
   * await catalog.dropTable({ namespace: ['analytics'], name: 'events' });
   * ```
   */
  async dropTable(id, options) {
    await this.tableOps.dropTable(id, options);
  }
  /**
   * Loads metadata for a table.
   *
   * @param id - Table identifier to load
   * @returns Table metadata including schema, partition spec, location, etc.
   *
   * @example
   * ```typescript
   * const metadata = await catalog.loadTable({ namespace: ['analytics'], name: 'events' });
   * console.log(metadata.schema);
   * console.log(metadata.location);
   * ```
   */
  async loadTable(id) {
    return this.tableOps.loadTable(id);
  }
  /**
   * Checks if a namespace exists in the catalog.
   *
   * @param id - Namespace identifier to check
   * @returns True if the namespace exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await catalog.namespaceExists({ namespace: ['analytics'] });
   * console.log(exists); // true or false
   * ```
   */
  async namespaceExists(id) {
    return this.namespaceOps.namespaceExists(id);
  }
  /**
   * Checks if a table exists in the catalog.
   *
   * @param id - Table identifier to check
   * @returns True if the table exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await catalog.tableExists({ namespace: ['analytics'], name: 'events' });
   * console.log(exists); // true or false
   * ```
   */
  async tableExists(id) {
    return this.tableOps.tableExists(id);
  }
  /**
   * Creates a namespace if it does not exist.
   *
   * If the namespace already exists, returns void. If created, returns the response.
   *
   * @param id - Namespace identifier to create
   * @param metadata - Optional metadata properties for the namespace
   * @returns Response containing the created namespace and its properties, or void if it already exists
   *
   * @example
   * ```typescript
   * const response = await catalog.createNamespaceIfNotExists(
   *   { namespace: ['analytics'] },
   *   { properties: { owner: 'data-team' } }
   * );
   * if (response) {
   *   console.log('Created:', response.namespace);
   * } else {
   *   console.log('Already exists');
   * }
   * ```
   */
  async createNamespaceIfNotExists(id, metadata) {
    return this.namespaceOps.createNamespaceIfNotExists(id, metadata);
  }
  /**
   * Creates a table if it does not exist.
   *
   * If the table already exists, returns its metadata instead.
   *
   * @param namespace - Namespace to create the table in
   * @param request - Table creation request including name, schema, partition spec, etc.
   * @returns Table metadata for the created or existing table
   *
   * @example
   * ```typescript
   * const metadata = await catalog.createTableIfNotExists(
   *   { namespace: ['analytics'] },
   *   {
   *     name: 'events',
   *     schema: {
   *       type: 'struct',
   *       fields: [
   *         { id: 1, name: 'id', type: 'long', required: true },
   *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
   *       ],
   *       'schema-id': 0
   *     }
   *   }
   * );
   * ```
   */
  async createTableIfNotExists(namespace, request) {
    return this.tableOps.createTableIfNotExists(namespace, request);
  }
};

// ../../node_modules/@supabase/storage-js/dist/index.mjs
var StorageError = class extends Error {
  constructor(message, namespace = "storage", status, statusCode) {
    super(message);
    this.__isStorageError = true;
    this.namespace = namespace;
    this.name = namespace === "vectors" ? "StorageVectorsError" : "StorageError";
    this.status = status;
    this.statusCode = statusCode;
  }
};
function isStorageError(error) {
  return typeof error === "object" && error !== null && "__isStorageError" in error;
}
var StorageApiError = class extends StorageError {
  constructor(message, status, statusCode, namespace = "storage") {
    super(message, namespace, status, statusCode);
    this.name = namespace === "vectors" ? "StorageVectorsApiError" : "StorageApiError";
    this.status = status;
    this.statusCode = statusCode;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusCode: this.statusCode
    };
  }
};
var StorageUnknownError = class extends StorageError {
  constructor(message, originalError, namespace = "storage") {
    super(message, namespace);
    this.name = namespace === "vectors" ? "StorageVectorsUnknownError" : "StorageUnknownError";
    this.originalError = originalError;
  }
};
var resolveFetch = (customFetch) => {
  if (customFetch) return (...args) => customFetch(...args);
  return (...args) => fetch(...args);
};
var isPlainObject = (value) => {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
};
var recursiveToCamel = (item) => {
  if (Array.isArray(item)) return item.map((el) => recursiveToCamel(el));
  else if (typeof item === "function" || item !== Object(item)) return item;
  const result = {};
  Object.entries(item).forEach(([key, value]) => {
    const newKey = key.replace(/([-_][a-z])/gi, (c) => c.toUpperCase().replace(/[-_]/g, ""));
    result[newKey] = recursiveToCamel(value);
  });
  return result;
};
var isValidBucketName = (bucketName) => {
  if (!bucketName || typeof bucketName !== "string") return false;
  if (bucketName.length === 0 || bucketName.length > 100) return false;
  if (bucketName.trim() !== bucketName) return false;
  if (bucketName.includes("/") || bucketName.includes("\\")) return false;
  return /^[\w!.\*'() &$@=;:+,?-]+$/.test(bucketName);
};
function _typeof2(o) {
  "@babel/helpers - typeof";
  return _typeof2 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
    return typeof o$1;
  } : function(o$1) {
    return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
  }, _typeof2(o);
}
function toPrimitive2(t, r) {
  if ("object" != _typeof2(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof2(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey2(t) {
  var i = toPrimitive2(t, "string");
  return "symbol" == _typeof2(i) ? i : i + "";
}
function _defineProperty2(e, r, t) {
  return (r = toPropertyKey2(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys3(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r$1) {
      return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread22(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys3(Object(t), true).forEach(function(r$1) {
      _defineProperty2(e, r$1, t[r$1]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys3(Object(t)).forEach(function(r$1) {
      Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
    });
  }
  return e;
}
var _getErrorMessage = (err) => {
  var _err$error;
  return err.msg || err.message || err.error_description || (typeof err.error === "string" ? err.error : (_err$error = err.error) === null || _err$error === void 0 ? void 0 : _err$error.message) || JSON.stringify(err);
};
var handleError = async (error, reject, options, namespace) => {
  if (error && typeof error === "object" && "status" in error && "ok" in error && typeof error.status === "number" && !(options === null || options === void 0 ? void 0 : options.noResolveJson)) {
    const responseError = error;
    const status = responseError.status || 500;
    if (typeof responseError.json === "function") responseError.json().then((err) => {
      const statusCode = (err === null || err === void 0 ? void 0 : err.statusCode) || (err === null || err === void 0 ? void 0 : err.code) || status + "";
      reject(new StorageApiError(_getErrorMessage(err), status, statusCode, namespace));
    }).catch(() => {
      if (namespace === "vectors") {
        const statusCode = status + "";
        reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
      } else {
        const statusCode = status + "";
        reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
      }
    });
    else {
      const statusCode = status + "";
      reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
    }
  } else reject(new StorageUnknownError(_getErrorMessage(error), error, namespace));
};
var _getRequestParams = (method, options, parameters, body) => {
  const params = {
    method,
    headers: (options === null || options === void 0 ? void 0 : options.headers) || {}
  };
  if (method === "GET" || method === "HEAD" || !body) return _objectSpread22(_objectSpread22({}, params), parameters);
  if (isPlainObject(body)) {
    params.headers = _objectSpread22({ "Content-Type": "application/json" }, options === null || options === void 0 ? void 0 : options.headers);
    params.body = JSON.stringify(body);
  } else params.body = body;
  if (options === null || options === void 0 ? void 0 : options.duplex) params.duplex = options.duplex;
  return _objectSpread22(_objectSpread22({}, params), parameters);
};
async function _handleRequest(fetcher, method, url, options, parameters, body, namespace) {
  return new Promise((resolve4, reject) => {
    fetcher(url, _getRequestParams(method, options, parameters, body)).then((result) => {
      if (!result.ok) throw result;
      if (options === null || options === void 0 ? void 0 : options.noResolveJson) return result;
      if (namespace === "vectors") {
        const contentType = result.headers.get("content-type");
        if (result.headers.get("content-length") === "0" || result.status === 204) return {};
        if (!contentType || !contentType.includes("application/json")) return {};
      }
      return result.json();
    }).then((data) => resolve4(data)).catch((error) => handleError(error, reject, options, namespace));
  });
}
function createFetchApi(namespace = "storage") {
  return {
    get: async (fetcher, url, options, parameters) => {
      return _handleRequest(fetcher, "GET", url, options, parameters, void 0, namespace);
    },
    post: async (fetcher, url, body, options, parameters) => {
      return _handleRequest(fetcher, "POST", url, options, parameters, body, namespace);
    },
    put: async (fetcher, url, body, options, parameters) => {
      return _handleRequest(fetcher, "PUT", url, options, parameters, body, namespace);
    },
    head: async (fetcher, url, options, parameters) => {
      return _handleRequest(fetcher, "HEAD", url, _objectSpread22(_objectSpread22({}, options), {}, { noResolveJson: true }), parameters, void 0, namespace);
    },
    remove: async (fetcher, url, body, options, parameters) => {
      return _handleRequest(fetcher, "DELETE", url, options, parameters, body, namespace);
    }
  };
}
var defaultApi = createFetchApi("storage");
var { get, post, put, head, remove } = defaultApi;
var vectorsApi = createFetchApi("vectors");
var BaseApiClient = class {
  /**
  * Creates a new BaseApiClient instance
  * @param url - Base URL for API requests
  * @param headers - Default headers for API requests
  * @param fetch - Optional custom fetch implementation
  * @param namespace - Error namespace ('storage' or 'vectors')
  */
  constructor(url, headers = {}, fetch$1, namespace = "storage") {
    this.shouldThrowOnError = false;
    this.url = url;
    this.headers = headers;
    this.fetch = resolveFetch(fetch$1);
    this.namespace = namespace;
  }
  /**
  * Enable throwing errors instead of returning them.
  * When enabled, errors are thrown instead of returned in { data, error } format.
  *
  * @returns this - For method chaining
  */
  throwOnError() {
    this.shouldThrowOnError = true;
    return this;
  }
  /**
  * Set an HTTP header for the request.
  * Creates a shallow copy of headers to avoid mutating shared state.
  *
  * @param name - Header name
  * @param value - Header value
  * @returns this - For method chaining
  */
  setHeader(name, value) {
    this.headers = _objectSpread22(_objectSpread22({}, this.headers), {}, { [name]: value });
    return this;
  }
  /**
  * Handles API operation with standardized error handling
  * Eliminates repetitive try-catch blocks across all API methods
  *
  * This wrapper:
  * 1. Executes the operation
  * 2. Returns { data, error: null } on success
  * 3. Returns { data: null, error } on failure (if shouldThrowOnError is false)
  * 4. Throws error on failure (if shouldThrowOnError is true)
  *
  * @typeParam T - The expected data type from the operation
  * @param operation - Async function that performs the API call
  * @returns Promise with { data, error } tuple
  *
  * @example
  * ```typescript
  * async listBuckets() {
  *   return this.handleOperation(async () => {
  *     return await get(this.fetch, `${this.url}/bucket`, {
  *       headers: this.headers,
  *     })
  *   })
  * }
  * ```
  */
  async handleOperation(operation) {
    var _this = this;
    try {
      return {
        data: await operation(),
        error: null
      };
    } catch (error) {
      if (_this.shouldThrowOnError) throw error;
      if (isStorageError(error)) return {
        data: null,
        error
      };
      throw error;
    }
  }
};
var StreamDownloadBuilder = class {
  constructor(downloadFn, shouldThrowOnError) {
    this.downloadFn = downloadFn;
    this.shouldThrowOnError = shouldThrowOnError;
  }
  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }
  async execute() {
    var _this = this;
    try {
      return {
        data: (await _this.downloadFn()).body,
        error: null
      };
    } catch (error) {
      if (_this.shouldThrowOnError) throw error;
      if (isStorageError(error)) return {
        data: null,
        error
      };
      throw error;
    }
  }
};
var _Symbol$toStringTag;
_Symbol$toStringTag = Symbol.toStringTag;
var BlobDownloadBuilder = class {
  constructor(downloadFn, shouldThrowOnError) {
    this.downloadFn = downloadFn;
    this.shouldThrowOnError = shouldThrowOnError;
    this[_Symbol$toStringTag] = "BlobDownloadBuilder";
    this.promise = null;
  }
  asStream() {
    return new StreamDownloadBuilder(this.downloadFn, this.shouldThrowOnError);
  }
  then(onfulfilled, onrejected) {
    return this.getPromise().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.getPromise().catch(onrejected);
  }
  finally(onfinally) {
    return this.getPromise().finally(onfinally);
  }
  getPromise() {
    if (!this.promise) this.promise = this.execute();
    return this.promise;
  }
  async execute() {
    var _this = this;
    try {
      return {
        data: await (await _this.downloadFn()).blob(),
        error: null
      };
    } catch (error) {
      if (_this.shouldThrowOnError) throw error;
      if (isStorageError(error)) return {
        data: null,
        error
      };
      throw error;
    }
  }
};
var DEFAULT_SEARCH_OPTIONS = {
  limit: 100,
  offset: 0,
  sortBy: {
    column: "name",
    order: "asc"
  }
};
var DEFAULT_FILE_OPTIONS = {
  cacheControl: "3600",
  contentType: "text/plain;charset=UTF-8",
  upsert: false
};
var StorageFileApi = class extends BaseApiClient {
  constructor(url, headers = {}, bucketId, fetch$1) {
    super(url, headers, fetch$1, "storage");
    this.bucketId = bucketId;
  }
  /**
  * Uploads a file to an existing bucket or replaces an existing file at the specified path with a new one.
  *
  * @param method HTTP method.
  * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param fileBody The body of the file to be stored in the bucket.
  */
  async uploadOrUpdate(method, path, fileBody, fileOptions) {
    var _this = this;
    return _this.handleOperation(async () => {
      let body;
      const options = _objectSpread22(_objectSpread22({}, DEFAULT_FILE_OPTIONS), fileOptions);
      let headers = _objectSpread22(_objectSpread22({}, _this.headers), method === "POST" && { "x-upsert": String(options.upsert) });
      const metadata = options.metadata;
      if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
        body = new FormData();
        body.append("cacheControl", options.cacheControl);
        if (metadata) body.append("metadata", _this.encodeMetadata(metadata));
        body.append("", fileBody);
      } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
        body = fileBody;
        if (!body.has("cacheControl")) body.append("cacheControl", options.cacheControl);
        if (metadata && !body.has("metadata")) body.append("metadata", _this.encodeMetadata(metadata));
      } else {
        body = fileBody;
        headers["cache-control"] = `max-age=${options.cacheControl}`;
        headers["content-type"] = options.contentType;
        if (metadata) headers["x-metadata"] = _this.toBase64(_this.encodeMetadata(metadata));
        if ((typeof ReadableStream !== "undefined" && body instanceof ReadableStream || body && typeof body === "object" && "pipe" in body && typeof body.pipe === "function") && !options.duplex) options.duplex = "half";
      }
      if (fileOptions === null || fileOptions === void 0 ? void 0 : fileOptions.headers) headers = _objectSpread22(_objectSpread22({}, headers), fileOptions.headers);
      const cleanPath = _this._removeEmptyFolders(path);
      const _path = _this._getFinalPath(cleanPath);
      const data = await (method == "PUT" ? put : post)(_this.fetch, `${_this.url}/object/${_path}`, body, _objectSpread22({ headers }, (options === null || options === void 0 ? void 0 : options.duplex) ? { duplex: options.duplex } : {}));
      return {
        path: cleanPath,
        id: data.Id,
        fullPath: data.Key
      };
    });
  }
  /**
  * Uploads a file to an existing bucket.
  *
  * @category File Buckets
  * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
  * @returns Promise with response containing file path, id, and fullPath or error
  *
  * @example Upload file
  * ```js
  * const avatarFile = event.target.files[0]
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .upload('public/avatar1.png', avatarFile, {
  *     cacheControl: '3600',
  *     upsert: false
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "public/avatar1.png",
  *     "fullPath": "avatars/public/avatar1.png"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Upload file using `ArrayBuffer` from base64 file data
  * ```js
  * import { decode } from 'base64-arraybuffer'
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .upload('public/avatar1.png', decode('base64FileData'), {
  *     contentType: 'image/png'
  *   })
  * ```
  */
  async upload(path, fileBody, fileOptions) {
    return this.uploadOrUpdate("POST", path, fileBody, fileOptions);
  }
  /**
  * Upload a file with a token generated from `createSignedUploadUrl`.
  *
  * @category File Buckets
  * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param token The token generated from `createSignedUploadUrl`
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions HTTP headers (cacheControl, contentType, etc.).
  * **Note:** The `upsert` option has no effect here. To enable upsert behavior,
  * pass `{ upsert: true }` when calling `createSignedUploadUrl()` instead.
  * @returns Promise with response containing file path and fullPath or error
  *
  * @example Upload to a signed URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .uploadToSignedUrl('folder/cat.jpg', 'token-from-createSignedUploadUrl', file)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "folder/cat.jpg",
  *     "fullPath": "avatars/folder/cat.jpg"
  *   },
  *   "error": null
  * }
  * ```
  */
  async uploadToSignedUrl(path, token, fileBody, fileOptions) {
    var _this3 = this;
    const cleanPath = _this3._removeEmptyFolders(path);
    const _path = _this3._getFinalPath(cleanPath);
    const url = new URL(_this3.url + `/object/upload/sign/${_path}`);
    url.searchParams.set("token", token);
    return _this3.handleOperation(async () => {
      let body;
      const options = _objectSpread22({ upsert: DEFAULT_FILE_OPTIONS.upsert }, fileOptions);
      const headers = _objectSpread22(_objectSpread22({}, _this3.headers), { "x-upsert": String(options.upsert) });
      if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
        body = new FormData();
        body.append("cacheControl", options.cacheControl);
        body.append("", fileBody);
      } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
        body = fileBody;
        body.append("cacheControl", options.cacheControl);
      } else {
        body = fileBody;
        headers["cache-control"] = `max-age=${options.cacheControl}`;
        headers["content-type"] = options.contentType;
      }
      return {
        path: cleanPath,
        fullPath: (await put(_this3.fetch, url.toString(), body, { headers })).Key
      };
    });
  }
  /**
  * Creates a signed upload URL.
  * Signed upload URLs can be used to upload files to the bucket without further authentication.
  * They are valid for 2 hours.
  *
  * @category File Buckets
  * @param path The file path, including the current file name. For example `folder/image.png`.
  * @param options.upsert If set to true, allows the file to be overwritten if it already exists.
  * @returns Promise with response containing signed upload URL, token, and path or error
  *
  * @example Create Signed Upload URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUploadUrl('folder/cat.jpg')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "signedUrl": "https://example.supabase.co/storage/v1/object/upload/sign/avatars/folder/cat.jpg?token=<TOKEN>",
  *     "path": "folder/cat.jpg",
  *     "token": "<TOKEN>"
  *   },
  *   "error": null
  * }
  * ```
  */
  async createSignedUploadUrl(path, options) {
    var _this4 = this;
    return _this4.handleOperation(async () => {
      let _path = _this4._getFinalPath(path);
      const headers = _objectSpread22({}, _this4.headers);
      if (options === null || options === void 0 ? void 0 : options.upsert) headers["x-upsert"] = "true";
      const data = await post(_this4.fetch, `${_this4.url}/object/upload/sign/${_path}`, {}, { headers });
      const url = new URL(_this4.url + data.url);
      const token = url.searchParams.get("token");
      if (!token) throw new StorageError("No token returned by API");
      return {
        signedUrl: url.toString(),
        path,
        token
      };
    });
  }
  /**
  * Replaces an existing file at the specified path with a new one.
  *
  * @category File Buckets
  * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to update.
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
  * @returns Promise with response containing file path, id, and fullPath or error
  *
  * @example Update file
  * ```js
  * const avatarFile = event.target.files[0]
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .update('public/avatar1.png', avatarFile, {
  *     cacheControl: '3600',
  *     upsert: true
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "public/avatar1.png",
  *     "fullPath": "avatars/public/avatar1.png"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Update file using `ArrayBuffer` from base64 file data
  * ```js
  * import {decode} from 'base64-arraybuffer'
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .update('public/avatar1.png', decode('base64FileData'), {
  *     contentType: 'image/png'
  *   })
  * ```
  */
  async update(path, fileBody, fileOptions) {
    return this.uploadOrUpdate("PUT", path, fileBody, fileOptions);
  }
  /**
  * Moves an existing file to a new path in the same bucket.
  *
  * @category File Buckets
  * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
  * @param toPath The new file path, including the new file name. For example `folder/image-new.png`.
  * @param options The destination options.
  * @returns Promise with response containing success message or error
  *
  * @example Move file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .move('public/avatar1.png', 'private/avatar2.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully moved"
  *   },
  *   "error": null
  * }
  * ```
  */
  async move(fromPath, toPath, options) {
    var _this6 = this;
    return _this6.handleOperation(async () => {
      return await post(_this6.fetch, `${_this6.url}/object/move`, {
        bucketId: _this6.bucketId,
        sourceKey: fromPath,
        destinationKey: toPath,
        destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
      }, { headers: _this6.headers });
    });
  }
  /**
  * Copies an existing file to a new path in the same bucket.
  *
  * @category File Buckets
  * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
  * @param toPath The new file path, including the new file name. For example `folder/image-copy.png`.
  * @param options The destination options.
  * @returns Promise with response containing copied file path or error
  *
  * @example Copy file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .copy('public/avatar1.png', 'private/avatar2.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "avatars/private/avatar2.png"
  *   },
  *   "error": null
  * }
  * ```
  */
  async copy(fromPath, toPath, options) {
    var _this7 = this;
    return _this7.handleOperation(async () => {
      return { path: (await post(_this7.fetch, `${_this7.url}/object/copy`, {
        bucketId: _this7.bucketId,
        sourceKey: fromPath,
        destinationKey: toPath,
        destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
      }, { headers: _this7.headers })).Key };
    });
  }
  /**
  * Creates a signed URL. Use a signed URL to share a file for a fixed amount of time.
  *
  * @category File Buckets
  * @param path The file path, including the current file name. For example `folder/image.png`.
  * @param expiresIn The number of seconds until the signed URL expires. For example, `60` for a URL which is valid for one minute.
  * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @param options.transform Transform the asset before serving it to the client.
  * @returns Promise with response containing signed URL or error
  *
  * @example Create Signed URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Create a signed URL for an asset with transformations
  * ```js
  * const { data } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60, {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *     }
  *   })
  * ```
  *
  * @example Create a signed URL which triggers the download of the asset
  * ```js
  * const { data } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60, {
  *     download: true,
  *   })
  * ```
  */
  async createSignedUrl(path, expiresIn, options) {
    var _this8 = this;
    return _this8.handleOperation(async () => {
      let _path = _this8._getFinalPath(path);
      let data = await post(_this8.fetch, `${_this8.url}/object/sign/${_path}`, _objectSpread22({ expiresIn }, (options === null || options === void 0 ? void 0 : options.transform) ? { transform: options.transform } : {}), { headers: _this8.headers });
      const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
      return { signedUrl: encodeURI(`${_this8.url}${data.signedURL}${downloadQueryParam}`) };
    });
  }
  /**
  * Creates multiple signed URLs. Use a signed URL to share a file for a fixed amount of time.
  *
  * @category File Buckets
  * @param paths The file paths to be downloaded, including the current file names. For example `['folder/image.png', 'folder2/image2.png']`.
  * @param expiresIn The number of seconds until the signed URLs expire. For example, `60` for URLs which are valid for one minute.
  * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @returns Promise with response containing array of objects with signedUrl, path, and error or error
  *
  * @example Create Signed URLs
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrls(['folder/avatar1.png', 'folder/avatar2.png'], 60)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "error": null,
  *       "path": "folder/avatar1.png",
  *       "signedURL": "/object/sign/avatars/folder/avatar1.png?token=<TOKEN>",
  *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
  *     },
  *     {
  *       "error": null,
  *       "path": "folder/avatar2.png",
  *       "signedURL": "/object/sign/avatars/folder/avatar2.png?token=<TOKEN>",
  *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar2.png?token=<TOKEN>"
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  */
  async createSignedUrls(paths, expiresIn, options) {
    var _this9 = this;
    return _this9.handleOperation(async () => {
      const data = await post(_this9.fetch, `${_this9.url}/object/sign/${_this9.bucketId}`, {
        expiresIn,
        paths
      }, { headers: _this9.headers });
      const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
      return data.map((datum) => _objectSpread22(_objectSpread22({}, datum), {}, { signedUrl: datum.signedURL ? encodeURI(`${_this9.url}${datum.signedURL}${downloadQueryParam}`) : null }));
    });
  }
  /**
  * Downloads a file from a private bucket. For public buckets, make a request to the URL returned from `getPublicUrl` instead.
  *
  * @category File Buckets
  * @param path The full path and file name of the file to be downloaded. For example `folder/image.png`.
  * @param options.transform Transform the asset before serving it to the client.
  * @param parameters Additional fetch parameters like signal for cancellation. Supports standard fetch options including cache control.
  * @returns BlobDownloadBuilder instance for downloading the file
  *
  * @example Download file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": <BLOB>,
  *   "error": null
  * }
  * ```
  *
  * @example Download file with transformations
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *       quality: 80
  *     }
  *   })
  * ```
  *
  * @example Download with cache control (useful in Edge Functions)
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {}, { cache: 'no-store' })
  * ```
  *
  * @example Download with abort signal
  * ```js
  * const controller = new AbortController()
  * setTimeout(() => controller.abort(), 5000)
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {}, { signal: controller.signal })
  * ```
  */
  download(path, options, parameters) {
    const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image/authenticated" : "object";
    const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
    const queryString = transformationQuery ? `?${transformationQuery}` : "";
    const _path = this._getFinalPath(path);
    const downloadFn = () => get(this.fetch, `${this.url}/${renderPath}/${_path}${queryString}`, {
      headers: this.headers,
      noResolveJson: true
    }, parameters);
    return new BlobDownloadBuilder(downloadFn, this.shouldThrowOnError);
  }
  /**
  * Retrieves the details of an existing file.
  *
  * @category File Buckets
  * @param path The file path, including the file name. For example `folder/image.png`.
  * @returns Promise with response containing file metadata or error
  *
  * @example Get file info
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .info('folder/avatar1.png')
  * ```
  */
  async info(path) {
    var _this10 = this;
    const _path = _this10._getFinalPath(path);
    return _this10.handleOperation(async () => {
      return recursiveToCamel(await get(_this10.fetch, `${_this10.url}/object/info/${_path}`, { headers: _this10.headers }));
    });
  }
  /**
  * Checks the existence of a file.
  *
  * @category File Buckets
  * @param path The file path, including the file name. For example `folder/image.png`.
  * @returns Promise with response containing boolean indicating file existence or error
  *
  * @example Check file existence
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .exists('folder/avatar1.png')
  * ```
  */
  async exists(path) {
    var _this11 = this;
    const _path = _this11._getFinalPath(path);
    try {
      await head(_this11.fetch, `${_this11.url}/object/${_path}`, { headers: _this11.headers });
      return {
        data: true,
        error: null
      };
    } catch (error) {
      if (_this11.shouldThrowOnError) throw error;
      if (isStorageError(error) && error instanceof StorageUnknownError) {
        const originalError = error.originalError;
        if ([400, 404].includes(originalError === null || originalError === void 0 ? void 0 : originalError.status)) return {
          data: false,
          error
        };
      }
      throw error;
    }
  }
  /**
  * A simple convenience function to get the URL for an asset in a public bucket. If you do not want to use this function, you can construct the public URL by concatenating the bucket URL with the path to the asset.
  * This function does not verify if the bucket is public. If a public URL is created for a bucket which is not public, you will not be able to download the asset.
  *
  * @category File Buckets
  * @param path The path and name of the file to generate the public URL for. For example `folder/image.png`.
  * @param options.download Triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @param options.transform Transform the asset before serving it to the client.
  * @returns Object with public URL
  *
  * @example Returns the URL for an asset in a public bucket
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "publicUrl": "https://example.supabase.co/storage/v1/object/public/public-bucket/folder/avatar1.png"
  *   }
  * }
  * ```
  *
  * @example Returns the URL for an asset in a public bucket with transformations
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png', {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *     }
  *   })
  * ```
  *
  * @example Returns the URL which triggers the download of an asset in a public bucket
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png', {
  *     download: true,
  *   })
  * ```
  */
  getPublicUrl(path, options) {
    const _path = this._getFinalPath(path);
    const _queryString = [];
    const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `download=${options.download === true ? "" : options.download}` : "";
    if (downloadQueryParam !== "") _queryString.push(downloadQueryParam);
    const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image" : "object";
    const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
    if (transformationQuery !== "") _queryString.push(transformationQuery);
    let queryString = _queryString.join("&");
    if (queryString !== "") queryString = `?${queryString}`;
    return { data: { publicUrl: encodeURI(`${this.url}/${renderPath}/public/${_path}${queryString}`) } };
  }
  /**
  * Deletes files within the same bucket
  *
  * @category File Buckets
  * @param paths An array of files to delete, including the path and file name. For example [`'folder/image.png'`].
  * @returns Promise with response containing array of deleted file objects or error
  *
  * @example Delete file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .remove(['folder/avatar1.png'])
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [],
  *   "error": null
  * }
  * ```
  */
  async remove(paths) {
    var _this12 = this;
    return _this12.handleOperation(async () => {
      return await remove(_this12.fetch, `${_this12.url}/object/${_this12.bucketId}`, { prefixes: paths }, { headers: _this12.headers });
    });
  }
  /**
  * Get file metadata
  * @param id the file id to retrieve metadata
  */
  /**
  * Update file metadata
  * @param id the file id to update metadata
  * @param meta the new file metadata
  */
  /**
  * Lists all the files and folders within a path of the bucket.
  *
  * @category File Buckets
  * @param path The folder path.
  * @param options Search options including limit (defaults to 100), offset, sortBy, and search
  * @param parameters Optional fetch parameters including signal for cancellation
  * @returns Promise with response containing array of files or error
  *
  * @example List files in a bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .list('folder', {
  *     limit: 100,
  *     offset: 0,
  *     sortBy: { column: 'name', order: 'asc' },
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "avatar1.png",
  *       "id": "e668cf7f-821b-4a2f-9dce-7dfa5dd1cfd2",
  *       "updated_at": "2024-05-22T23:06:05.580Z",
  *       "created_at": "2024-05-22T23:04:34.443Z",
  *       "last_accessed_at": "2024-05-22T23:04:34.443Z",
  *       "metadata": {
  *         "eTag": "\"c5e8c553235d9af30ef4f6e280790b92\"",
  *         "size": 32175,
  *         "mimetype": "image/png",
  *         "cacheControl": "max-age=3600",
  *         "lastModified": "2024-05-22T23:06:05.574Z",
  *         "contentLength": 32175,
  *         "httpStatusCode": 200
  *       }
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  *
  * @example Search files in a bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .list('folder', {
  *     limit: 100,
  *     offset: 0,
  *     sortBy: { column: 'name', order: 'asc' },
  *     search: 'jon'
  *   })
  * ```
  */
  async list(path, options, parameters) {
    var _this13 = this;
    return _this13.handleOperation(async () => {
      const body = _objectSpread22(_objectSpread22(_objectSpread22({}, DEFAULT_SEARCH_OPTIONS), options), {}, { prefix: path || "" });
      return await post(_this13.fetch, `${_this13.url}/object/list/${_this13.bucketId}`, body, { headers: _this13.headers }, parameters);
    });
  }
  /**
  * @experimental this method signature might change in the future
  *
  * @category File Buckets
  * @param options search options
  * @param parameters
  */
  async listV2(options, parameters) {
    var _this14 = this;
    return _this14.handleOperation(async () => {
      const body = _objectSpread22({}, options);
      return await post(_this14.fetch, `${_this14.url}/object/list-v2/${_this14.bucketId}`, body, { headers: _this14.headers }, parameters);
    });
  }
  encodeMetadata(metadata) {
    return JSON.stringify(metadata);
  }
  toBase64(data) {
    if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64");
    return btoa(data);
  }
  _getFinalPath(path) {
    return `${this.bucketId}/${path.replace(/^\/+/, "")}`;
  }
  _removeEmptyFolders(path) {
    return path.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
  }
  transformOptsToQueryString(transform) {
    const params = [];
    if (transform.width) params.push(`width=${transform.width}`);
    if (transform.height) params.push(`height=${transform.height}`);
    if (transform.resize) params.push(`resize=${transform.resize}`);
    if (transform.format) params.push(`format=${transform.format}`);
    if (transform.quality) params.push(`quality=${transform.quality}`);
    return params.join("&");
  }
};
var version = "2.98.0";
var DEFAULT_HEADERS = { "X-Client-Info": `storage-js/${version}` };
var StorageBucketApi = class extends BaseApiClient {
  constructor(url, headers = {}, fetch$1, opts) {
    const baseUrl = new URL(url);
    if (opts === null || opts === void 0 ? void 0 : opts.useNewHostname) {
      if (/supabase\.(co|in|red)$/.test(baseUrl.hostname) && !baseUrl.hostname.includes("storage.supabase.")) baseUrl.hostname = baseUrl.hostname.replace("supabase.", "storage.supabase.");
    }
    const finalUrl = baseUrl.href.replace(/\/$/, "");
    const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), headers);
    super(finalUrl, finalHeaders, fetch$1, "storage");
  }
  /**
  * Retrieves the details of all Storage buckets within an existing project.
  *
  * @category File Buckets
  * @param options Query parameters for listing buckets
  * @param options.limit Maximum number of buckets to return
  * @param options.offset Number of buckets to skip
  * @param options.sortColumn Column to sort by ('id', 'name', 'created_at', 'updated_at')
  * @param options.sortOrder Sort order ('asc' or 'desc')
  * @param options.search Search term to filter bucket names
  * @returns Promise with response containing array of buckets or error
  *
  * @example List buckets
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .listBuckets()
  * ```
  *
  * @example List buckets with options
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .listBuckets({
  *     limit: 10,
  *     offset: 0,
  *     sortColumn: 'created_at',
  *     sortOrder: 'desc',
  *     search: 'prod'
  *   })
  * ```
  */
  async listBuckets(options) {
    var _this = this;
    return _this.handleOperation(async () => {
      const queryString = _this.listBucketOptionsToQueryString(options);
      return await get(_this.fetch, `${_this.url}/bucket${queryString}`, { headers: _this.headers });
    });
  }
  /**
  * Retrieves the details of an existing Storage bucket.
  *
  * @category File Buckets
  * @param id The unique identifier of the bucket you would like to retrieve.
  * @returns Promise with response containing bucket details or error
  *
  * @example Get bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .getBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "id": "avatars",
  *     "name": "avatars",
  *     "owner": "",
  *     "public": false,
  *     "file_size_limit": 1024,
  *     "allowed_mime_types": [
  *       "image/png"
  *     ],
  *     "created_at": "2024-05-22T22:26:05.100Z",
  *     "updated_at": "2024-05-22T22:26:05.100Z"
  *   },
  *   "error": null
  * }
  * ```
  */
  async getBucket(id) {
    var _this2 = this;
    return _this2.handleOperation(async () => {
      return await get(_this2.fetch, `${_this2.url}/bucket/${id}`, { headers: _this2.headers });
    });
  }
  /**
  * Creates a new Storage bucket
  *
  * @category File Buckets
  * @param id A unique identifier for the bucket you are creating.
  * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations. By default, buckets are private.
  * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
  * The global file size limit takes precedence over this value.
  * The default value is null, which doesn't set a per bucket file size limit.
  * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
  * The default value is null, which allows files with all mime types to be uploaded.
  * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
  * @param options.type (private-beta) specifies the bucket type. see `BucketType` for more details.
  *   - default bucket type is `STANDARD`
  * @returns Promise with response containing newly created bucket name or error
  *
  * @example Create bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .createBucket('avatars', {
  *     public: false,
  *     allowedMimeTypes: ['image/png'],
  *     fileSizeLimit: 1024
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "name": "avatars"
  *   },
  *   "error": null
  * }
  * ```
  */
  async createBucket(id, options = { public: false }) {
    var _this3 = this;
    return _this3.handleOperation(async () => {
      return await post(_this3.fetch, `${_this3.url}/bucket`, {
        id,
        name: id,
        type: options.type,
        public: options.public,
        file_size_limit: options.fileSizeLimit,
        allowed_mime_types: options.allowedMimeTypes
      }, { headers: _this3.headers });
    });
  }
  /**
  * Updates a Storage bucket
  *
  * @category File Buckets
  * @param id A unique identifier for the bucket you are updating.
  * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations.
  * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
  * The global file size limit takes precedence over this value.
  * The default value is null, which doesn't set a per bucket file size limit.
  * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
  * The default value is null, which allows files with all mime types to be uploaded.
  * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
  * @returns Promise with response containing success message or error
  *
  * @example Update bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .updateBucket('avatars', {
  *     public: false,
  *     allowedMimeTypes: ['image/png'],
  *     fileSizeLimit: 1024
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully updated"
  *   },
  *   "error": null
  * }
  * ```
  */
  async updateBucket(id, options) {
    var _this4 = this;
    return _this4.handleOperation(async () => {
      return await put(_this4.fetch, `${_this4.url}/bucket/${id}`, {
        id,
        name: id,
        public: options.public,
        file_size_limit: options.fileSizeLimit,
        allowed_mime_types: options.allowedMimeTypes
      }, { headers: _this4.headers });
    });
  }
  /**
  * Removes all objects inside a single bucket.
  *
  * @category File Buckets
  * @param id The unique identifier of the bucket you would like to empty.
  * @returns Promise with success message or error
  *
  * @example Empty bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .emptyBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully emptied"
  *   },
  *   "error": null
  * }
  * ```
  */
  async emptyBucket(id) {
    var _this5 = this;
    return _this5.handleOperation(async () => {
      return await post(_this5.fetch, `${_this5.url}/bucket/${id}/empty`, {}, { headers: _this5.headers });
    });
  }
  /**
  * Deletes an existing bucket. A bucket can't be deleted with existing objects inside it.
  * You must first `empty()` the bucket.
  *
  * @category File Buckets
  * @param id The unique identifier of the bucket you would like to delete.
  * @returns Promise with success message or error
  *
  * @example Delete bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .deleteBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully deleted"
  *   },
  *   "error": null
  * }
  * ```
  */
  async deleteBucket(id) {
    var _this6 = this;
    return _this6.handleOperation(async () => {
      return await remove(_this6.fetch, `${_this6.url}/bucket/${id}`, {}, { headers: _this6.headers });
    });
  }
  listBucketOptionsToQueryString(options) {
    const params = {};
    if (options) {
      if ("limit" in options) params.limit = String(options.limit);
      if ("offset" in options) params.offset = String(options.offset);
      if (options.search) params.search = options.search;
      if (options.sortColumn) params.sortColumn = options.sortColumn;
      if (options.sortOrder) params.sortOrder = options.sortOrder;
    }
    return Object.keys(params).length > 0 ? "?" + new URLSearchParams(params).toString() : "";
  }
};
var StorageAnalyticsClient = class extends BaseApiClient {
  /**
  * @alpha
  *
  * Creates a new StorageAnalyticsClient instance
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param url - The base URL for the storage API
  * @param headers - HTTP headers to include in requests
  * @param fetch - Optional custom fetch implementation
  *
  * @example
  * ```typescript
  * const client = new StorageAnalyticsClient(url, headers)
  * ```
  */
  constructor(url, headers = {}, fetch$1) {
    const finalUrl = url.replace(/\/$/, "");
    const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), headers);
    super(finalUrl, finalHeaders, fetch$1, "storage");
  }
  /**
  * @alpha
  *
  * Creates a new analytics bucket using Iceberg tables
  * Analytics buckets are optimized for analytical queries and data processing
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param name A unique name for the bucket you are creating
  * @returns Promise with response containing newly created analytics bucket or error
  *
  * @example Create analytics bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .createBucket('analytics-data')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "name": "analytics-data",
  *     "type": "ANALYTICS",
  *     "format": "iceberg",
  *     "created_at": "2024-05-22T22:26:05.100Z",
  *     "updated_at": "2024-05-22T22:26:05.100Z"
  *   },
  *   "error": null
  * }
  * ```
  */
  async createBucket(name) {
    var _this = this;
    return _this.handleOperation(async () => {
      return await post(_this.fetch, `${_this.url}/bucket`, { name }, { headers: _this.headers });
    });
  }
  /**
  * @alpha
  *
  * Retrieves the details of all Analytics Storage buckets within an existing project
  * Only returns buckets of type 'ANALYTICS'
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param options Query parameters for listing buckets
  * @param options.limit Maximum number of buckets to return
  * @param options.offset Number of buckets to skip
  * @param options.sortColumn Column to sort by ('name', 'created_at', 'updated_at')
  * @param options.sortOrder Sort order ('asc' or 'desc')
  * @param options.search Search term to filter bucket names
  * @returns Promise with response containing array of analytics buckets or error
  *
  * @example List analytics buckets
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .listBuckets({
  *     limit: 10,
  *     offset: 0,
  *     sortColumn: 'created_at',
  *     sortOrder: 'desc'
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "analytics-data",
  *       "type": "ANALYTICS",
  *       "format": "iceberg",
  *       "created_at": "2024-05-22T22:26:05.100Z",
  *       "updated_at": "2024-05-22T22:26:05.100Z"
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  */
  async listBuckets(options) {
    var _this2 = this;
    return _this2.handleOperation(async () => {
      const queryParams = new URLSearchParams();
      if ((options === null || options === void 0 ? void 0 : options.limit) !== void 0) queryParams.set("limit", options.limit.toString());
      if ((options === null || options === void 0 ? void 0 : options.offset) !== void 0) queryParams.set("offset", options.offset.toString());
      if (options === null || options === void 0 ? void 0 : options.sortColumn) queryParams.set("sortColumn", options.sortColumn);
      if (options === null || options === void 0 ? void 0 : options.sortOrder) queryParams.set("sortOrder", options.sortOrder);
      if (options === null || options === void 0 ? void 0 : options.search) queryParams.set("search", options.search);
      const queryString = queryParams.toString();
      const url = queryString ? `${_this2.url}/bucket?${queryString}` : `${_this2.url}/bucket`;
      return await get(_this2.fetch, url, { headers: _this2.headers });
    });
  }
  /**
  * @alpha
  *
  * Deletes an existing analytics bucket
  * A bucket can't be deleted with existing objects inside it
  * You must first empty the bucket before deletion
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param bucketName The unique identifier of the bucket you would like to delete
  * @returns Promise with response containing success message or error
  *
  * @example Delete analytics bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .deleteBucket('analytics-data')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully deleted"
  *   },
  *   "error": null
  * }
  * ```
  */
  async deleteBucket(bucketName) {
    var _this3 = this;
    return _this3.handleOperation(async () => {
      return await remove(_this3.fetch, `${_this3.url}/bucket/${bucketName}`, {}, { headers: _this3.headers });
    });
  }
  /**
  * @alpha
  *
  * Get an Iceberg REST Catalog client configured for a specific analytics bucket
  * Use this to perform advanced table and namespace operations within the bucket
  * The returned client provides full access to the Apache Iceberg REST Catalog API
  * with the Supabase `{ data, error }` pattern for consistent error handling on all operations.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param bucketName - The name of the analytics bucket (warehouse) to connect to
  * @returns The wrapped Iceberg catalog client
  * @throws {StorageError} If the bucket name is invalid
  *
  * @example Get catalog and create table
  * ```js
  * // First, create an analytics bucket
  * const { data: bucket, error: bucketError } = await supabase
  *   .storage
  *   .analytics
  *   .createBucket('analytics-data')
  *
  * // Get the Iceberg catalog for that bucket
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // Create a namespace
  * const { error: nsError } = await catalog.createNamespace({ namespace: ['default'] })
  *
  * // Create a table with schema
  * const { data: tableMetadata, error: tableError } = await catalog.createTable(
  *   { namespace: ['default'] },
  *   {
  *     name: 'events',
  *     schema: {
  *       type: 'struct',
  *       fields: [
  *         { id: 1, name: 'id', type: 'long', required: true },
  *         { id: 2, name: 'timestamp', type: 'timestamp', required: true },
  *         { id: 3, name: 'user_id', type: 'string', required: false }
  *       ],
  *       'schema-id': 0,
  *       'identifier-field-ids': [1]
  *     },
  *     'partition-spec': {
  *       'spec-id': 0,
  *       fields: []
  *     },
  *     'write-order': {
  *       'order-id': 0,
  *       fields: []
  *     },
  *     properties: {
  *       'write.format.default': 'parquet'
  *     }
  *   }
  * )
  * ```
  *
  * @example List tables in namespace
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // List all tables in the default namespace
  * const { data: tables, error: listError } = await catalog.listTables({ namespace: ['default'] })
  * if (listError) {
  *   if (listError.isNotFound()) {
  *     console.log('Namespace not found')
  *   }
  *   return
  * }
  * console.log(tables) // [{ namespace: ['default'], name: 'events' }]
  * ```
  *
  * @example Working with namespaces
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // List all namespaces
  * const { data: namespaces } = await catalog.listNamespaces()
  *
  * // Create namespace with properties
  * await catalog.createNamespace(
  *   { namespace: ['production'] },
  *   { properties: { owner: 'data-team', env: 'prod' } }
  * )
  * ```
  *
  * @example Cleanup operations
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // Drop table with purge option (removes all data)
  * const { error: dropError } = await catalog.dropTable(
  *   { namespace: ['default'], name: 'events' },
  *   { purge: true }
  * )
  *
  * if (dropError?.isNotFound()) {
  *   console.log('Table does not exist')
  * }
  *
  * // Drop namespace (must be empty)
  * await catalog.dropNamespace({ namespace: ['default'] })
  * ```
  *
  * @remarks
  * This method provides a bridge between Supabase's bucket management and the standard
  * Apache Iceberg REST Catalog API. The bucket name maps to the Iceberg warehouse parameter.
  * All authentication and configuration is handled automatically using your Supabase credentials.
  *
  * **Error Handling**: Invalid bucket names throw immediately. All catalog
  * operations return `{ data, error }` where errors are `IcebergError` instances from iceberg-js.
  * Use helper methods like `error.isNotFound()` or check `error.status` for specific error handling.
  * Use `.throwOnError()` on the analytics client if you prefer exceptions for catalog operations.
  *
  * **Cleanup Operations**: When using `dropTable`, the `purge: true` option permanently
  * deletes all table data. Without it, the table is marked as deleted but data remains.
  *
  * **Library Dependency**: The returned catalog wraps `IcebergRestCatalog` from iceberg-js.
  * For complete API documentation and advanced usage, refer to the
  * [iceberg-js documentation](https://supabase.github.io/iceberg-js/).
  */
  from(bucketName) {
    var _this4 = this;
    if (!isValidBucketName(bucketName)) throw new StorageError("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
    const catalog = new IcebergRestCatalog({
      baseUrl: this.url,
      catalogName: bucketName,
      auth: {
        type: "custom",
        getHeaders: async () => _this4.headers
      },
      fetch: this.fetch
    });
    const shouldThrowOnError = this.shouldThrowOnError;
    return new Proxy(catalog, { get(target, prop) {
      const value = target[prop];
      if (typeof value !== "function") return value;
      return async (...args) => {
        try {
          return {
            data: await value.apply(target, args),
            error: null
          };
        } catch (error) {
          if (shouldThrowOnError) throw error;
          return {
            data: null,
            error
          };
        }
      };
    } });
  }
};
var VectorIndexApi = class extends BaseApiClient {
  /** Creates a new VectorIndexApi instance */
  constructor(url, headers = {}, fetch$1) {
    const finalUrl = url.replace(/\/$/, "");
    const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
    super(finalUrl, finalHeaders, fetch$1, "vectors");
  }
  /** Creates a new vector index within a bucket */
  async createIndex(options) {
    var _this = this;
    return _this.handleOperation(async () => {
      return await vectorsApi.post(_this.fetch, `${_this.url}/CreateIndex`, options, { headers: _this.headers }) || {};
    });
  }
  /** Retrieves metadata for a specific vector index */
  async getIndex(vectorBucketName, indexName) {
    var _this2 = this;
    return _this2.handleOperation(async () => {
      return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetIndex`, {
        vectorBucketName,
        indexName
      }, { headers: _this2.headers });
    });
  }
  /** Lists vector indexes within a bucket with optional filtering and pagination */
  async listIndexes(options) {
    var _this3 = this;
    return _this3.handleOperation(async () => {
      return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListIndexes`, options, { headers: _this3.headers });
    });
  }
  /** Deletes a vector index and all its data */
  async deleteIndex(vectorBucketName, indexName) {
    var _this4 = this;
    return _this4.handleOperation(async () => {
      return await vectorsApi.post(_this4.fetch, `${_this4.url}/DeleteIndex`, {
        vectorBucketName,
        indexName
      }, { headers: _this4.headers }) || {};
    });
  }
};
var VectorDataApi = class extends BaseApiClient {
  /** Creates a new VectorDataApi instance */
  constructor(url, headers = {}, fetch$1) {
    const finalUrl = url.replace(/\/$/, "");
    const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
    super(finalUrl, finalHeaders, fetch$1, "vectors");
  }
  /** Inserts or updates vectors in batch (1-500 per request) */
  async putVectors(options) {
    var _this = this;
    if (options.vectors.length < 1 || options.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
    return _this.handleOperation(async () => {
      return await vectorsApi.post(_this.fetch, `${_this.url}/PutVectors`, options, { headers: _this.headers }) || {};
    });
  }
  /** Retrieves vectors by their keys in batch */
  async getVectors(options) {
    var _this2 = this;
    return _this2.handleOperation(async () => {
      return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetVectors`, options, { headers: _this2.headers });
    });
  }
  /** Lists vectors in an index with pagination */
  async listVectors(options) {
    var _this3 = this;
    if (options.segmentCount !== void 0) {
      if (options.segmentCount < 1 || options.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
      if (options.segmentIndex !== void 0) {
        if (options.segmentIndex < 0 || options.segmentIndex >= options.segmentCount) throw new Error(`segmentIndex must be between 0 and ${options.segmentCount - 1}`);
      }
    }
    return _this3.handleOperation(async () => {
      return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListVectors`, options, { headers: _this3.headers });
    });
  }
  /** Queries for similar vectors using approximate nearest neighbor search */
  async queryVectors(options) {
    var _this4 = this;
    return _this4.handleOperation(async () => {
      return await vectorsApi.post(_this4.fetch, `${_this4.url}/QueryVectors`, options, { headers: _this4.headers });
    });
  }
  /** Deletes vectors by their keys in batch (1-500 per request) */
  async deleteVectors(options) {
    var _this5 = this;
    if (options.keys.length < 1 || options.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
    return _this5.handleOperation(async () => {
      return await vectorsApi.post(_this5.fetch, `${_this5.url}/DeleteVectors`, options, { headers: _this5.headers }) || {};
    });
  }
};
var VectorBucketApi = class extends BaseApiClient {
  /** Creates a new VectorBucketApi instance */
  constructor(url, headers = {}, fetch$1) {
    const finalUrl = url.replace(/\/$/, "");
    const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
    super(finalUrl, finalHeaders, fetch$1, "vectors");
  }
  /** Creates a new vector bucket */
  async createBucket(vectorBucketName) {
    var _this = this;
    return _this.handleOperation(async () => {
      return await vectorsApi.post(_this.fetch, `${_this.url}/CreateVectorBucket`, { vectorBucketName }, { headers: _this.headers }) || {};
    });
  }
  /** Retrieves metadata for a specific vector bucket */
  async getBucket(vectorBucketName) {
    var _this2 = this;
    return _this2.handleOperation(async () => {
      return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetVectorBucket`, { vectorBucketName }, { headers: _this2.headers });
    });
  }
  /** Lists vector buckets with optional filtering and pagination */
  async listBuckets(options = {}) {
    var _this3 = this;
    return _this3.handleOperation(async () => {
      return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListVectorBuckets`, options, { headers: _this3.headers });
    });
  }
  /** Deletes a vector bucket (must be empty first) */
  async deleteBucket(vectorBucketName) {
    var _this4 = this;
    return _this4.handleOperation(async () => {
      return await vectorsApi.post(_this4.fetch, `${_this4.url}/DeleteVectorBucket`, { vectorBucketName }, { headers: _this4.headers }) || {};
    });
  }
};
var StorageVectorsClient = class extends VectorBucketApi {
  /**
  * @alpha
  *
  * Creates a StorageVectorsClient that can manage buckets, indexes, and vectors.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param url - Base URL of the Storage Vectors REST API.
  * @param options.headers - Optional headers (for example `Authorization`) applied to every request.
  * @param options.fetch - Optional custom `fetch` implementation for non-browser runtimes.
  *
  * @example
  * ```typescript
  * const client = new StorageVectorsClient(url, options)
  * ```
  */
  constructor(url, options = {}) {
    super(url, options.headers || {}, options.fetch);
  }
  /**
  *
  * @alpha
  *
  * Access operations for a specific vector bucket
  * Returns a scoped client for index and vector operations within the bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Name of the vector bucket
  * @returns Bucket-scoped client with index and vector operations
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * ```
  */
  from(vectorBucketName) {
    return new VectorBucketScope(this.url, this.headers, vectorBucketName, this.fetch);
  }
  /**
  *
  * @alpha
  *
  * Creates a new vector bucket
  * Vector buckets are containers for vector indexes and their data
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Unique name for the vector bucket
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .createBucket('embeddings-prod')
  * ```
  */
  async createBucket(vectorBucketName) {
    var _superprop_getCreateBucket = () => super.createBucket, _this = this;
    return _superprop_getCreateBucket().call(_this, vectorBucketName);
  }
  /**
  *
  * @alpha
  *
  * Retrieves metadata for a specific vector bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Name of the vector bucket
  * @returns Promise with bucket metadata or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .getBucket('embeddings-prod')
  *
  * console.log('Bucket created:', data?.vectorBucket.creationTime)
  * ```
  */
  async getBucket(vectorBucketName) {
    var _superprop_getGetBucket = () => super.getBucket, _this2 = this;
    return _superprop_getGetBucket().call(_this2, vectorBucketName);
  }
  /**
  *
  * @alpha
  *
  * Lists all vector buckets with optional filtering and pagination
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Optional filters (prefix, maxResults, nextToken)
  * @returns Promise with list of buckets or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .listBuckets({ prefix: 'embeddings-' })
  *
  * data?.vectorBuckets.forEach(bucket => {
  *   console.log(bucket.vectorBucketName)
  * })
  * ```
  */
  async listBuckets(options = {}) {
    var _superprop_getListBuckets = () => super.listBuckets, _this3 = this;
    return _superprop_getListBuckets().call(_this3, options);
  }
  /**
  *
  * @alpha
  *
  * Deletes a vector bucket (bucket must be empty)
  * All indexes must be deleted before deleting the bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Name of the vector bucket to delete
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .deleteBucket('embeddings-old')
  * ```
  */
  async deleteBucket(vectorBucketName) {
    var _superprop_getDeleteBucket = () => super.deleteBucket, _this4 = this;
    return _superprop_getDeleteBucket().call(_this4, vectorBucketName);
  }
};
var VectorBucketScope = class extends VectorIndexApi {
  /**
  * @alpha
  *
  * Creates a helper that automatically scopes all index operations to the provided bucket.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * ```
  */
  constructor(url, headers, vectorBucketName, fetch$1) {
    super(url, headers, fetch$1);
    this.vectorBucketName = vectorBucketName;
  }
  /**
  *
  * @alpha
  *
  * Creates a new vector index in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Index configuration (vectorBucketName is automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * await bucket.createIndex({
  *   indexName: 'documents-openai',
  *   dataType: 'float32',
  *   dimension: 1536,
  *   distanceMetric: 'cosine',
  *   metadataConfiguration: {
  *     nonFilterableMetadataKeys: ['raw_text']
  *   }
  * })
  * ```
  */
  async createIndex(options) {
    var _superprop_getCreateIndex = () => super.createIndex, _this5 = this;
    return _superprop_getCreateIndex().call(_this5, _objectSpread22(_objectSpread22({}, options), {}, { vectorBucketName: _this5.vectorBucketName }));
  }
  /**
  *
  * @alpha
  *
  * Lists indexes in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Listing options (vectorBucketName is automatically set)
  * @returns Promise with response containing indexes array and pagination token or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * const { data } = await bucket.listIndexes({ prefix: 'documents-' })
  * ```
  */
  async listIndexes(options = {}) {
    var _superprop_getListIndexes = () => super.listIndexes, _this6 = this;
    return _superprop_getListIndexes().call(_this6, _objectSpread22(_objectSpread22({}, options), {}, { vectorBucketName: _this6.vectorBucketName }));
  }
  /**
  *
  * @alpha
  *
  * Retrieves metadata for a specific index in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param indexName - Name of the index to retrieve
  * @returns Promise with index metadata or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * const { data } = await bucket.getIndex('documents-openai')
  * console.log('Dimension:', data?.index.dimension)
  * ```
  */
  async getIndex(indexName) {
    var _superprop_getGetIndex = () => super.getIndex, _this7 = this;
    return _superprop_getGetIndex().call(_this7, _this7.vectorBucketName, indexName);
  }
  /**
  *
  * @alpha
  *
  * Deletes an index from this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param indexName - Name of the index to delete
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * await bucket.deleteIndex('old-index')
  * ```
  */
  async deleteIndex(indexName) {
    var _superprop_getDeleteIndex = () => super.deleteIndex, _this8 = this;
    return _superprop_getDeleteIndex().call(_this8, _this8.vectorBucketName, indexName);
  }
  /**
  *
  * @alpha
  *
  * Access operations for a specific index within this bucket
  * Returns a scoped client for vector data operations
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param indexName - Name of the index
  * @returns Index-scoped client with vector data operations
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  *
  * // Insert vectors
  * await index.putVectors({
  *   vectors: [
  *     { key: 'doc-1', data: { float32: [...] }, metadata: { title: 'Intro' } }
  *   ]
  * })
  *
  * // Query similar vectors
  * const { data } = await index.queryVectors({
  *   queryVector: { float32: [...] },
  *   topK: 5
  * })
  * ```
  */
  index(indexName) {
    return new VectorIndexScope(this.url, this.headers, this.vectorBucketName, indexName, this.fetch);
  }
};
var VectorIndexScope = class extends VectorDataApi {
  /**
  *
  * @alpha
  *
  * Creates a helper that automatically scopes all vector operations to the provided bucket/index names.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * ```
  */
  constructor(url, headers, vectorBucketName, indexName, fetch$1) {
    super(url, headers, fetch$1);
    this.vectorBucketName = vectorBucketName;
    this.indexName = indexName;
  }
  /**
  *
  * @alpha
  *
  * Inserts or updates vectors in this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Vector insertion options (bucket and index names automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * await index.putVectors({
  *   vectors: [
  *     {
  *       key: 'doc-1',
  *       data: { float32: [0.1, 0.2, ...] },
  *       metadata: { title: 'Introduction', page: 1 }
  *     }
  *   ]
  * })
  * ```
  */
  async putVectors(options) {
    var _superprop_getPutVectors = () => super.putVectors, _this9 = this;
    return _superprop_getPutVectors().call(_this9, _objectSpread22(_objectSpread22({}, options), {}, {
      vectorBucketName: _this9.vectorBucketName,
      indexName: _this9.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Retrieves vectors by keys from this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Vector retrieval options (bucket and index names automatically set)
  * @returns Promise with response containing vectors array or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.getVectors({
  *   keys: ['doc-1', 'doc-2'],
  *   returnMetadata: true
  * })
  * ```
  */
  async getVectors(options) {
    var _superprop_getGetVectors = () => super.getVectors, _this10 = this;
    return _superprop_getGetVectors().call(_this10, _objectSpread22(_objectSpread22({}, options), {}, {
      vectorBucketName: _this10.vectorBucketName,
      indexName: _this10.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Lists vectors in this index with pagination
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Listing options (bucket and index names automatically set)
  * @returns Promise with response containing vectors array and pagination token or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.listVectors({
  *   maxResults: 500,
  *   returnMetadata: true
  * })
  * ```
  */
  async listVectors(options = {}) {
    var _superprop_getListVectors = () => super.listVectors, _this11 = this;
    return _superprop_getListVectors().call(_this11, _objectSpread22(_objectSpread22({}, options), {}, {
      vectorBucketName: _this11.vectorBucketName,
      indexName: _this11.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Queries for similar vectors in this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Query options (bucket and index names automatically set)
  * @returns Promise with response containing matches array of similar vectors ordered by distance or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.queryVectors({
  *   queryVector: { float32: [0.1, 0.2, ...] },
  *   topK: 5,
  *   filter: { category: 'technical' },
  *   returnDistance: true,
  *   returnMetadata: true
  * })
  * ```
  */
  async queryVectors(options) {
    var _superprop_getQueryVectors = () => super.queryVectors, _this12 = this;
    return _superprop_getQueryVectors().call(_this12, _objectSpread22(_objectSpread22({}, options), {}, {
      vectorBucketName: _this12.vectorBucketName,
      indexName: _this12.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Deletes vectors by keys from this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Deletion options (bucket and index names automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * await index.deleteVectors({
  *   keys: ['doc-1', 'doc-2', 'doc-3']
  * })
  * ```
  */
  async deleteVectors(options) {
    var _superprop_getDeleteVectors = () => super.deleteVectors, _this13 = this;
    return _superprop_getDeleteVectors().call(_this13, _objectSpread22(_objectSpread22({}, options), {}, {
      vectorBucketName: _this13.vectorBucketName,
      indexName: _this13.indexName
    }));
  }
};
var StorageClient = class extends StorageBucketApi {
  /**
  * Creates a client for Storage buckets, files, analytics, and vectors.
  *
  * @category File Buckets
  * @example
  * ```ts
  * import { StorageClient } from '@supabase/storage-js'
  *
  * const storage = new StorageClient('https://xyzcompany.supabase.co/storage/v1', {
  *   apikey: 'public-anon-key',
  * })
  * const avatars = storage.from('avatars')
  * ```
  */
  constructor(url, headers = {}, fetch$1, opts) {
    super(url, headers, fetch$1, opts);
  }
  /**
  * Perform file operation in a bucket.
  *
  * @category File Buckets
  * @param id The bucket id to operate on.
  *
  * @example
  * ```typescript
  * const avatars = supabase.storage.from('avatars')
  * ```
  */
  from(id) {
    return new StorageFileApi(this.url, this.headers, id, this.fetch);
  }
  /**
  *
  * @alpha
  *
  * Access vector storage operations.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @returns A StorageVectorsClient instance configured with the current storage settings.
  */
  get vectors() {
    return new StorageVectorsClient(this.url + "/vector", {
      headers: this.headers,
      fetch: this.fetch
    });
  }
  /**
  *
  * @alpha
  *
  * Access analytics storage operations using Iceberg tables.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @returns A StorageAnalyticsClient instance configured with the current storage settings.
  */
  get analytics() {
    return new StorageAnalyticsClient(this.url + "/iceberg", this.headers, this.fetch);
  }
};

// ../../node_modules/@supabase/supabase-js/dist/index.mjs
var import_auth_js = __toESM(require_main3(), 1);
__reExport(dist_exports, __toESM(require_main2(), 1));
__reExport(dist_exports, __toESM(require_main3(), 1));
var version2 = "2.98.0";
var JS_ENV = "";
if (typeof Deno !== "undefined") JS_ENV = "deno";
else if (typeof document !== "undefined") JS_ENV = "web";
else if (typeof navigator !== "undefined" && navigator.product === "ReactNative") JS_ENV = "react-native";
else JS_ENV = "node";
var DEFAULT_HEADERS2 = { "X-Client-Info": `supabase-js-${JS_ENV}/${version2}` };
var DEFAULT_GLOBAL_OPTIONS = { headers: DEFAULT_HEADERS2 };
var DEFAULT_DB_OPTIONS = { schema: "public" };
var DEFAULT_AUTH_OPTIONS = {
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  flowType: "implicit"
};
var DEFAULT_REALTIME_OPTIONS = {};
function _typeof3(o) {
  "@babel/helpers - typeof";
  return _typeof3 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
    return typeof o$1;
  } : function(o$1) {
    return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
  }, _typeof3(o);
}
function toPrimitive3(t, r) {
  if ("object" != _typeof3(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof3(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey3(t) {
  var i = toPrimitive3(t, "string");
  return "symbol" == _typeof3(i) ? i : i + "";
}
function _defineProperty3(e, r, t) {
  return (r = toPropertyKey3(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys4(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r$1) {
      return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread23(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys4(Object(t), true).forEach(function(r$1) {
      _defineProperty3(e, r$1, t[r$1]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys4(Object(t)).forEach(function(r$1) {
      Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
    });
  }
  return e;
}
var resolveFetch2 = (customFetch) => {
  if (customFetch) return (...args) => customFetch(...args);
  return (...args) => fetch(...args);
};
var resolveHeadersConstructor = () => {
  return Headers;
};
var fetchWithAuth = (supabaseKey, getAccessToken, customFetch) => {
  const fetch$1 = resolveFetch2(customFetch);
  const HeadersConstructor = resolveHeadersConstructor();
  return async (input, init) => {
    var _await$getAccessToken;
    const accessToken = (_await$getAccessToken = await getAccessToken()) !== null && _await$getAccessToken !== void 0 ? _await$getAccessToken : supabaseKey;
    let headers = new HeadersConstructor(init === null || init === void 0 ? void 0 : init.headers);
    if (!headers.has("apikey")) headers.set("apikey", supabaseKey);
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch$1(input, _objectSpread23(_objectSpread23({}, init), {}, { headers }));
  };
};
function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : url + "/";
}
function applySettingDefaults(options, defaults) {
  var _DEFAULT_GLOBAL_OPTIO, _globalOptions$header;
  const { db: dbOptions, auth: authOptions, realtime: realtimeOptions, global: globalOptions } = options;
  const { db: DEFAULT_DB_OPTIONS$1, auth: DEFAULT_AUTH_OPTIONS$1, realtime: DEFAULT_REALTIME_OPTIONS$1, global: DEFAULT_GLOBAL_OPTIONS$1 } = defaults;
  const result = {
    db: _objectSpread23(_objectSpread23({}, DEFAULT_DB_OPTIONS$1), dbOptions),
    auth: _objectSpread23(_objectSpread23({}, DEFAULT_AUTH_OPTIONS$1), authOptions),
    realtime: _objectSpread23(_objectSpread23({}, DEFAULT_REALTIME_OPTIONS$1), realtimeOptions),
    storage: {},
    global: _objectSpread23(_objectSpread23(_objectSpread23({}, DEFAULT_GLOBAL_OPTIONS$1), globalOptions), {}, { headers: _objectSpread23(_objectSpread23({}, (_DEFAULT_GLOBAL_OPTIO = DEFAULT_GLOBAL_OPTIONS$1 === null || DEFAULT_GLOBAL_OPTIONS$1 === void 0 ? void 0 : DEFAULT_GLOBAL_OPTIONS$1.headers) !== null && _DEFAULT_GLOBAL_OPTIO !== void 0 ? _DEFAULT_GLOBAL_OPTIO : {}), (_globalOptions$header = globalOptions === null || globalOptions === void 0 ? void 0 : globalOptions.headers) !== null && _globalOptions$header !== void 0 ? _globalOptions$header : {}) }),
    accessToken: async () => ""
  };
  if (options.accessToken) result.accessToken = options.accessToken;
  else delete result.accessToken;
  return result;
}
function validateSupabaseUrl(supabaseUrl) {
  const trimmedUrl = supabaseUrl === null || supabaseUrl === void 0 ? void 0 : supabaseUrl.trim();
  if (!trimmedUrl) throw new Error("supabaseUrl is required.");
  if (!trimmedUrl.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  try {
    return new URL(ensureTrailingSlash(trimmedUrl));
  } catch (_unused) {
    throw Error("Invalid supabaseUrl: Provided URL is malformed.");
  }
}
var SupabaseAuthClient = class extends import_auth_js.AuthClient {
  constructor(options) {
    super(options);
  }
};
var SupabaseClient = class {
  /**
  * Create a new client for use in the browser.
  * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
  * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
  * @param options.db.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
  * @param options.auth.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
  * @param options.auth.persistSession Set to "true" if you want to automatically save the user session into local storage.
  * @param options.auth.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
  * @param options.realtime Options passed along to realtime-js constructor.
  * @param options.storage Options passed along to the storage-js constructor.
  * @param options.global.fetch A custom fetch implementation.
  * @param options.global.headers Any additional headers to send with each network request.
  * @example
  * ```ts
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
  * const { data } = await supabase.from('profiles').select('*')
  * ```
  */
  constructor(supabaseUrl, supabaseKey, options) {
    var _settings$auth$storag, _settings$global$head;
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    const baseUrl = validateSupabaseUrl(supabaseUrl);
    if (!supabaseKey) throw new Error("supabaseKey is required.");
    this.realtimeUrl = new URL("realtime/v1", baseUrl);
    this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws");
    this.authUrl = new URL("auth/v1", baseUrl);
    this.storageUrl = new URL("storage/v1", baseUrl);
    this.functionsUrl = new URL("functions/v1", baseUrl);
    const defaultStorageKey = `sb-${baseUrl.hostname.split(".")[0]}-auth-token`;
    const DEFAULTS = {
      db: DEFAULT_DB_OPTIONS,
      realtime: DEFAULT_REALTIME_OPTIONS,
      auth: _objectSpread23(_objectSpread23({}, DEFAULT_AUTH_OPTIONS), {}, { storageKey: defaultStorageKey }),
      global: DEFAULT_GLOBAL_OPTIONS
    };
    const settings = applySettingDefaults(options !== null && options !== void 0 ? options : {}, DEFAULTS);
    this.storageKey = (_settings$auth$storag = settings.auth.storageKey) !== null && _settings$auth$storag !== void 0 ? _settings$auth$storag : "";
    this.headers = (_settings$global$head = settings.global.headers) !== null && _settings$global$head !== void 0 ? _settings$global$head : {};
    if (!settings.accessToken) {
      var _settings$auth;
      this.auth = this._initSupabaseAuthClient((_settings$auth = settings.auth) !== null && _settings$auth !== void 0 ? _settings$auth : {}, this.headers, settings.global.fetch);
    } else {
      this.accessToken = settings.accessToken;
      this.auth = new Proxy({}, { get: (_, prop) => {
        throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(prop)} is not possible`);
      } });
    }
    this.fetch = fetchWithAuth(supabaseKey, this._getAccessToken.bind(this), settings.global.fetch);
    this.realtime = this._initRealtimeClient(_objectSpread23({
      headers: this.headers,
      accessToken: this._getAccessToken.bind(this)
    }, settings.realtime));
    if (this.accessToken) Promise.resolve(this.accessToken()).then((token) => this.realtime.setAuth(token)).catch((e) => console.warn("Failed to set initial Realtime auth token:", e));
    this.rest = new PostgrestClient(new URL("rest/v1", baseUrl).href, {
      headers: this.headers,
      schema: settings.db.schema,
      fetch: this.fetch,
      timeout: settings.db.timeout,
      urlLengthLimit: settings.db.urlLengthLimit
    });
    this.storage = new StorageClient(this.storageUrl.href, this.headers, this.fetch, options === null || options === void 0 ? void 0 : options.storage);
    if (!settings.accessToken) this._listenForAuthEvents();
  }
  /**
  * Supabase Functions allows you to deploy and invoke edge functions.
  */
  get functions() {
    return new import_functions_js.FunctionsClient(this.functionsUrl.href, {
      headers: this.headers,
      customFetch: this.fetch
    });
  }
  /**
  * Perform a query on a table or a view.
  *
  * @param relation - The table or view name to query
  */
  from(relation) {
    return this.rest.from(relation);
  }
  /**
  * Select a schema to query or perform an function (rpc) call.
  *
  * The schema needs to be on the list of exposed schemas inside Supabase.
  *
  * @param schema - The schema to query
  */
  schema(schema) {
    return this.rest.schema(schema);
  }
  /**
  * Perform a function call.
  *
  * @param fn - The function name to call
  * @param args - The arguments to pass to the function call
  * @param options - Named parameters
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  * @param options.get - When set to `true`, the function will be called with
  * read-only access mode.
  * @param options.count - Count algorithm to use to count rows returned by the
  * function. Only applicable for [set-returning
  * functions](https://www.postgresql.org/docs/current/functions-srf.html).
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  */
  rpc(fn, args = {}, options = {
    head: false,
    get: false,
    count: void 0
  }) {
    return this.rest.rpc(fn, args, options);
  }
  /**
  * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
  *
  * @param {string} name - The name of the Realtime channel.
  * @param {Object} opts - The options to pass to the Realtime channel.
  *
  */
  channel(name, opts = { config: {} }) {
    return this.realtime.channel(name, opts);
  }
  /**
  * Returns all Realtime channels.
  */
  getChannels() {
    return this.realtime.getChannels();
  }
  /**
  * Unsubscribes and removes Realtime channel from Realtime client.
  *
  * @param {RealtimeChannel} channel - The name of the Realtime channel.
  *
  */
  removeChannel(channel) {
    return this.realtime.removeChannel(channel);
  }
  /**
  * Unsubscribes and removes all Realtime channels from Realtime client.
  */
  removeAllChannels() {
    return this.realtime.removeAllChannels();
  }
  async _getAccessToken() {
    var _this = this;
    var _data$session$access_, _data$session;
    if (_this.accessToken) return await _this.accessToken();
    const { data } = await _this.auth.getSession();
    return (_data$session$access_ = (_data$session = data.session) === null || _data$session === void 0 ? void 0 : _data$session.access_token) !== null && _data$session$access_ !== void 0 ? _data$session$access_ : _this.supabaseKey;
  }
  _initSupabaseAuthClient({ autoRefreshToken, persistSession, detectSessionInUrl, storage, userStorage, storageKey, flowType, lock, debug, throwOnError }, headers, fetch$1) {
    const authHeaders = {
      Authorization: `Bearer ${this.supabaseKey}`,
      apikey: `${this.supabaseKey}`
    };
    return new SupabaseAuthClient({
      url: this.authUrl.href,
      headers: _objectSpread23(_objectSpread23({}, authHeaders), headers),
      storageKey,
      autoRefreshToken,
      persistSession,
      detectSessionInUrl,
      storage,
      userStorage,
      flowType,
      lock,
      debug,
      throwOnError,
      fetch: fetch$1,
      hasCustomAuthorizationHeader: Object.keys(this.headers).some((key) => key.toLowerCase() === "authorization")
    });
  }
  _initRealtimeClient(options) {
    return new import_realtime_js.RealtimeClient(this.realtimeUrl.href, _objectSpread23(_objectSpread23({}, options), {}, { params: _objectSpread23(_objectSpread23({}, { apikey: this.supabaseKey }), options === null || options === void 0 ? void 0 : options.params) }));
  }
  _listenForAuthEvents() {
    return this.auth.onAuthStateChange((event, session) => {
      this._handleTokenChanged(event, "CLIENT", session === null || session === void 0 ? void 0 : session.access_token);
    });
  }
  _handleTokenChanged(event, source, token) {
    if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && this.changedAccessToken !== token) {
      this.changedAccessToken = token;
      this.realtime.setAuth(token);
    } else if (event === "SIGNED_OUT") {
      this.realtime.setAuth();
      if (source == "STORAGE") this.auth.signOut();
      this.changedAccessToken = void 0;
    }
  }
};
var createClient = (supabaseUrl, supabaseKey, options) => {
  return new SupabaseClient(supabaseUrl, supabaseKey, options);
};
function shouldShowDeprecationWarning() {
  if (typeof window !== "undefined") return false;
  const _process = globalThis["process"];
  if (!_process) return false;
  const processVersion = _process["version"];
  if (processVersion === void 0 || processVersion === null) return false;
  const versionMatch = processVersion.match(/^v(\d+)\./);
  if (!versionMatch) return false;
  return parseInt(versionMatch[1], 10) <= 18;
}
if (shouldShowDeprecationWarning()) console.warn("\u26A0\uFE0F  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217");

// ../../node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// ../local-agent/dist/connection.js
import { execFile as execFile3 } from "node:child_process";
import { readFileSync as readFileSync4, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3, appendFileSync as appendFileSync3 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join5 } from "node:path";
import { promisify as promisify3 } from "node:util";

// ../local-agent/dist/executor.js
import { execFile as execFile2 } from "node:child_process";
import { existsSync as existsSync4, readFileSync as readFileSync3, renameSync, unlinkSync, mkdirSync as mkdirSync2, rmSync as rmSync3, symlinkSync as symlinkSync2, appendFileSync as appendFileSync2, statSync } from "node:fs";
import { promisify as promisify2 } from "node:util";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname2, join as join4, resolve as resolve2 } from "node:path";
import { writeFileSync as writeFileSync2 } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// ../local-agent/dist/workspace.js
import { writeFileSync, mkdirSync, existsSync as existsSync2, copyFileSync, readFileSync as readFileSync2, appendFileSync, symlinkSync, rmSync } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";
var SUBAGENT_CONFIGS = {
  roles: {
    "code-investigator": {
      name: "Code Investigator",
      description: "Read-only codebase exploration \u2014 answers questions about code structure, patterns, and implementation details",
      subagent_type: "Explore",
      model: "claude-sonnet-4-6",
      tools: ["Read", "Grep", "Glob", "Bash"],
      prompt: "You are a Code Investigator sub-agent. Your job is to explore the provided codebase(s) and answer the question given to you. You have READ-ONLY access. Do not write, edit, or delete any files. Do not run commands that modify the repository. Search thoroughly, trace execution paths, and return a clear, concise answer with relevant file paths and line numbers."
    }
  }
};
function resolveSkillSourcePath(config, skillName) {
  if (config.repoSkillsDir) {
    const flatPath = join2(config.repoSkillsDir, `${skillName}.md`);
    if (existsSync2(flatPath))
      return flatPath;
    const nestedPath = join2(config.repoSkillsDir, skillName, "SKILL.md");
    if (existsSync2(nestedPath))
      return nestedPath;
  }
  if (config.repoInteractiveSkillsDir) {
    const interactivePath = join2(config.repoInteractiveSkillsDir, skillName, "SKILL.md");
    if (existsSync2(interactivePath))
      return interactivePath;
  }
  return null;
}
function generateMcpConfig(mcpServerPath, env) {
  return {
    mcpServers: {
      "zazig-messaging": {
        command: "node",
        args: [mcpServerPath],
        env: {
          SUPABASE_URL: env.supabaseUrl,
          SUPABASE_ANON_KEY: env.supabaseAnonKey,
          ZAZIG_JOB_ID: env.jobId,
          ...env.companyId ? { ZAZIG_COMPANY_ID: env.companyId } : {},
          ...env.allowedTools ? { ZAZIG_ALLOWED_TOOLS: env.allowedTools.join(",") } : {},
          ...env.tmuxSession ? { ZAZIG_TMUX_SESSION: env.tmuxSession } : {},
          ...env.role ? { ZAZIG_ROLE: env.role } : {},
          ...env.machineId ? { ZAZIG_MACHINE_ID: env.machineId } : {}
        }
      }
    }
  };
}
var STANDARD_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep"
];
var ROLE_DEFAULT_MCP_TOOLS = {
  "cpo": ["query_projects", "create_feature", "create_decision", "update_feature", "start_expert_session"],
  "breakdown-specialist": ["query_features", "batch_create_jobs"]
};
var MEMORY_MAINTENANCE_SECTION = `## Memory Maintenance

At the end of every work session, update your memory files in \`.claude/memory/\`:

- **priorities.md** \u2014 Reflect current P0-P3 items
- **decisions.md** \u2014 Add new open decisions; mark resolved ones
- **context.md** \u2014 Update what's in flight, what happened, what's blocked
- **handoff.md** \u2014 Write notes for cross-session consumers (expert sessions, diagnostics)

These files are read by other sessions via the exec context skill. Keep them current.
`;
function generateAllowedTools(role, mcpTools) {
  const roleDefaults = ROLE_DEFAULT_MCP_TOOLS[role] ?? [];
  const extra = mcpTools ?? [];
  const allMcp = [.../* @__PURE__ */ new Set([...roleDefaults, ...extra])];
  const toolList = allMcp.map((name) => `mcp__zazig-messaging__${name}`);
  const extraClaudeTools = role === "cpo" ? ["Agent"] : [];
  return [...STANDARD_TOOLS, ...extraClaudeTools, ...toolList];
}
async function writeSubagentsConfig(workspaceDir, subagentsConfig = SUBAGENT_CONFIGS) {
  const subagentsPath = join2(workspaceDir, ".claude", "subagents.json");
  writeFileSync(subagentsPath, JSON.stringify(subagentsConfig, null, 2));
}
function generateExecSkill(role, workspacePath) {
  const skillDir = join2(workspacePath, ".claude", "skills", `as-${role.name}`);
  mkdirSync(skillDir, { recursive: true });
  const displayName = role.name.toUpperCase();
  const sections = [
    "---",
    `name: as-${role.name}`,
    `description: Load ${displayName}'s context into this session`,
    "---",
    "",
    `# Operating as ${displayName}`,
    "",
    "## Role Context",
    role.prompt,
    "",
    "## Workspace",
    `- Memory: ${workspacePath}/.claude/memory/`,
    `- Repos: ${workspacePath}/repos/`
  ];
  if (role.heartbeat_md?.trim()) {
    sections.push("", "## Current Heartbeat Tasks", role.heartbeat_md);
  }
  writeFileSync(join2(skillDir, "SKILL.md"), `${sections.join("\n")}
`);
}
function publishSharedExecSkill(role, workspacePath, repoRoot) {
  const skillDir = join2(repoRoot, ".claude", "skills", `as-${role.name}`);
  mkdirSync(skillDir, { recursive: true });
  const displayName = role.name.toUpperCase();
  const homedir6 = process.env.HOME ?? "/root";
  const portablePath = workspacePath.startsWith(homedir6) ? workspacePath.replace(homedir6, "~") : workspacePath;
  const promptLines = role.prompt.split("\n").filter((l) => l.trim());
  const summary = promptLines.slice(0, 5).join("\n");
  const truncated = summary.length < role.prompt.length ? `${summary}

_(Summarised \u2014 full context available in the exec's own workspace)_` : summary;
  const sections = [
    "---",
    `name: as-${role.name}`,
    `description: |`,
    `  Load ${displayName}'s context, knowledge, and workspace links into this session.`,
    `  Use when you need ${role.name}-level awareness in a non-persistent context.`,
    "---",
    "",
    `# Operating as ${displayName}`,
    "",
    "## Role Summary",
    truncated,
    "",
    "## Workspace (read-only access)",
    `- Memory: ${portablePath}/.claude/memory/ _(READ ONLY \u2014 do not modify)_`,
    `- Repos: ${portablePath}/repos/`,
    `- State: ${portablePath}/.claude/workspace-config.json`
  ];
  if (role.heartbeat_md?.trim()) {
    sections.push("", "## Current Heartbeat Tasks", role.heartbeat_md);
  }
  sections.push("", "## How to Use This Skill", `You are not the ${role.name}. You are a session that has been given ${displayName}'s`, "context and workspace access. Use this to:", `- Make decisions consistent with ${displayName}'s perspective`, `- Read ${displayName}'s memory and state files (do NOT write to them)`, `- Continue work that ${displayName} started`, `- Provide ${role.name}-level analysis without needing the persistent session`, "", `If you need to communicate something to ${displayName}, write a report to your`, "own workspace \u2014 do not modify the exec's memory files directly.");
  writeFileSync(join2(skillDir, "SKILL.md"), `${sections.join("\n")}
`);
}
function defaultRoleDisplayName(role) {
  return role.split("-").map((part) => {
    if (part.length <= 3)
      return part.toUpperCase();
    if (part.toUpperCase() === part)
      return part;
    return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
  }).join(" ");
}
function seedMemoryFiles(claudeDir, roleDisplayName) {
  const memoryDir = join2(claudeDir, "memory");
  mkdirSync(memoryDir, { recursive: true });
  const fileTemplates = [
    {
      name: "priorities.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Priorities",
        "",
        "## P0 - Critical This Wake",
        "- [ ]",
        "",
        "## P1 - Active This Week",
        "- [ ]",
        "",
        "## P2 - Important, Not Urgent",
        "- [ ]",
        "",
        "## P3 - Parked / Backlog",
        "- [ ]",
        ""
      ].join("\n")
    },
    {
      name: "decisions.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Open Decisions",
        "",
        "## Decision",
        "- Summary:",
        "- Options:",
        "- Owner:",
        "- Needed by:",
        "- Status: Open",
        ""
      ].join("\n")
    },
    {
      name: "context.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Working Context",
        "",
        "## What's In Flight",
        "-",
        "",
        "## Recent Events",
        "-",
        "",
        "## Blocked On",
        "-",
        ""
      ].join("\n")
    },
    {
      name: "handoff.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Handoff Notes",
        "",
        "## If You're Picking Up My Work",
        "-",
        "",
        "## Active Decisions Waiting on Human",
        "-",
        "",
        "## Known Issues",
        "-",
        ""
      ].join("\n")
    }
  ];
  for (const template of fileTemplates) {
    const filePath = join2(memoryDir, template.name);
    if (!existsSync2(filePath)) {
      writeFileSync(filePath, template.content);
    }
  }
}
function setupJobWorkspace(config) {
  mkdirSync(config.workspaceDir, { recursive: true });
  const claudeDir = join2(config.workspaceDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  const mcpConfig = generateMcpConfig(config.mcpServerPath, {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    jobId: config.jobId,
    companyId: config.companyId,
    allowedTools: config.mcpTools,
    tmuxSession: config.tmuxSession,
    role: config.role,
    machineId: config.machineId
  });
  writeFileSync(join2(config.workspaceDir, ".mcp.json"), JSON.stringify(mcpConfig, null, 2));
  writeFileSync(join2(config.workspaceDir, "CLAUDE.md"), config.claudeMdContent);
  if (config.heartbeatMd !== void 0) {
    const hasMemoryMaintenance = config.heartbeatMd.includes("## Memory Maintenance");
    const heartbeatContent = hasMemoryMaintenance ? config.heartbeatMd : `${config.heartbeatMd}${config.heartbeatMd.endsWith("\n") || config.heartbeatMd.length === 0 ? "" : "\n\n"}${MEMORY_MAINTENANCE_SECTION}`;
    writeFileSync(join2(claudeDir, "HEARTBEAT.md"), heartbeatContent);
    seedMemoryFiles(claudeDir, config.roleDisplayName ?? defaultRoleDisplayName(config.role));
  }
  if (config.heartbeatMd !== void 0) {
    const memoryDir = join2(claudeDir, "memory");
    mkdirSync(memoryDir, { recursive: true });
    const heartbeatStatePath = join2(memoryDir, "heartbeat-state.json");
    if (!existsSync2(heartbeatStatePath)) {
      writeFileSync(heartbeatStatePath, JSON.stringify({
        lastWakeAt: null,
        taskCompletions: {}
      }, null, 2));
    }
  }
  const worktreeMetadataDir = resolveGitWorktreeMetadataDir(config.workspaceDir);
  const permissions = {
    allow: generateAllowedTools(config.role, config.mcpTools),
    ...worktreeMetadataDir ? { additionalDirectories: [worktreeMetadataDir] } : {}
  };
  writeFileSync(join2(claudeDir, "settings.json"), JSON.stringify({ permissions }, null, 2));
  writeFileSync(join2(claudeDir, "settings.local.json"), JSON.stringify({
    enableAllProjectMcpServers: true,
    enabledMcpjsonServers: ["zazig-messaging"]
  }, null, 2));
  writeFileSync(join2(claudeDir, "workspace-config.json"), JSON.stringify({
    machineId: config.machineId ?? null,
    companyId: config.companyId ?? null,
    jobId: config.jobId,
    role: config.role
  }, null, 2));
  if (config.skills && config.skills.length > 0) {
    for (const skillName of config.skills) {
      const sourcePath = resolveSkillSourcePath(config, skillName);
      if (!sourcePath) {
        console.warn(`[workspace] Skill "${skillName}" not found in repo sources`);
        continue;
      }
      const destDir = join2(config.workspaceDir, ".claude", "skills", skillName);
      const destPath = join2(destDir, "SKILL.md");
      mkdirSync(destDir, { recursive: true });
      if (config.useSymlinks) {
        rmSync(destPath, { force: true, recursive: true });
        try {
          symlinkSync(sourcePath, destPath);
        } catch (err) {
          console.warn(`[workspace] Failed to symlink skill "${skillName}", falling back to copy: ${String(err)}`);
          copyFileSync(sourcePath, destPath);
        }
      } else {
        copyFileSync(sourcePath, destPath);
      }
    }
  }
  const gitMarker = join2(config.workspaceDir, ".git");
  if (existsSync2(gitMarker)) {
    const GITIGNORE_MARKER = "# zazig workspace files (auto-generated)";
    const gitignorePath = join2(config.workspaceDir, ".gitignore");
    const GITIGNORE_BLOCK = [
      GITIGNORE_MARKER,
      "CLAUDE.md",
      ".mcp.json",
      ".claude/",
      ".zazig-prompt.txt",
      "subagent-personality.md",
      ""
    ].join("\n");
    const existingContent = existsSync2(gitignorePath) ? readFileSync2(gitignorePath, "utf8") : "";
    if (!existingContent.includes(GITIGNORE_MARKER)) {
      appendFileSync(gitignorePath, (existingContent.endsWith("\n") || existingContent === "" ? "" : "\n") + GITIGNORE_BLOCK);
    }
  }
}
function resolveGitWorktreeMetadataDir(workspaceDir) {
  const gitMarker = join2(workspaceDir, ".git");
  if (!existsSync2(gitMarker))
    return null;
  try {
    const gitMarkerContent = readFileSync2(gitMarker, "utf8").trim();
    const match = gitMarkerContent.match(/^gitdir:\s*(.+)\s*$/i);
    if (!match?.[1])
      return null;
    const gitDirPath = match[1].trim();
    return resolve(dirname(gitMarker), gitDirPath);
  } catch {
    return null;
  }
}

// ../local-agent/dist/branches.js
import { execFile } from "node:child_process";
import { existsSync as existsSync3, rmSync as rmSync2 } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join as join3 } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
async function git(repoDir, ...args) {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    encoding: "utf8"
  });
  return stdout.trim();
}
function getErrorMessage(error) {
  if (typeof error === "object" && error !== null) {
    const stderr = "stderr" in error ? error.stderr : void 0;
    if (typeof stderr === "string" && stderr.trim().length > 0) {
      return stderr.trim();
    }
    const message = "message" in error ? error.message : void 0;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }
  return String(error);
}
var WORKTREE_BASE = join3(process.env.HOME ?? "~", ".zazigv2/worktrees");
async function rebaseOnBranch(repoDir, sourceBranch, targetBranch) {
  try {
    await git(repoDir, "checkout", sourceBranch);
    await git(repoDir, "rebase", targetBranch);
    return { success: true };
  } catch (error) {
    try {
      await git(repoDir, "rebase", "--abort");
    } catch {
    }
    return { success: false, error: getErrorMessage(error) };
  }
}
async function mergeJobIntoFeature(repoDir, jobBranch, featureBranch) {
  try {
    await git(repoDir, "checkout", featureBranch);
    await git(repoDir, "merge", "--no-ff", jobBranch);
    return { success: true };
  } catch (error) {
    try {
      await git(repoDir, "merge", "--abort");
    } catch {
    }
    return { success: false, error: getErrorMessage(error) };
  }
}
async function createWorktree(repoDir, branch) {
  const slug = branch.replace(/\//g, "-");
  const worktreePath = join3(WORKTREE_BASE, slug);
  await mkdir(WORKTREE_BASE, { recursive: true });
  await git(repoDir, "worktree", "add", worktreePath, branch);
  return worktreePath;
}
async function removeWorktree(repoDir, worktreePath) {
  try {
    await git(repoDir, "worktree", "remove", "--force", worktreePath);
  } catch {
  }
}
var REPOS_BASE = join3(process.env.HOME ?? "~", ".zazigv2/repos");
var RepoManager = class {
  locks = /* @__PURE__ */ new Map();
  async git(repoDir, ...args) {
    return git(repoDir, ...args);
  }
  /** Serialise all git operations for a given repo dir. */
  async withLock(repoDir, fn) {
    const prev = this.locks.get(repoDir) ?? Promise.resolve();
    let resolve4;
    const next = new Promise((r) => {
      resolve4 = r;
    });
    this.locks.set(repoDir, next);
    await prev;
    try {
      return await fn();
    } finally {
      resolve4();
      if (this.locks.get(repoDir) === next) {
        this.locks.delete(repoDir);
      }
    }
  }
  /**
   * Bare-clone repoUrl to ~/.zazigv2/repos/{name}/ if not exists, else fetch --prune.
   * Ensures the fetch refspec is set (bare clones of empty repos omit it).
   * If the repo is empty (no commits), seeds it with an initial empty commit so
   * branches can be created from it.
   * Returns the repo dir path.
   */
  async ensureRepo(repoUrl, projectName) {
    const repoDir = join3(REPOS_BASE, projectName);
    return this.withLock(repoDir, async () => {
      await mkdir(REPOS_BASE, { recursive: true });
      if (!existsSync3(repoDir)) {
        await execFileAsync("git", ["clone", "--bare", repoUrl, repoDir], { encoding: "utf8" });
      }
      await this.git(repoDir, "config", "remote.origin.fetch", "refs/heads/*:refs/heads/*");
      try {
        await this.git(repoDir, "rev-parse", "--verify", "HEAD");
      } catch {
        const tmpDir = join3(REPOS_BASE, `.tmp-init-${projectName}`);
        try {
          await execFileAsync("git", ["clone", repoUrl, tmpDir], { encoding: "utf8" });
          await execFileAsync("git", ["-C", tmpDir, "commit", "--allow-empty", "-m", "Initial commit"], { encoding: "utf8" });
          await execFileAsync("git", ["-C", tmpDir, "push", "origin", "HEAD"], { encoding: "utf8" });
        } finally {
          await execFileAsync("rm", ["-rf", tmpDir]).catch(() => {
          });
        }
        try {
          await this.git(repoDir, "fetch", "origin");
        } catch (e) {
          console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
        }
      }
      return repoDir;
    });
  }
  /**
   * Ensure a shared worktree for the project exists and is checked out on
   * a stable default branch (prefers master when available).
   * If an existing worktree is corrupted, remove and recreate it.
   */
  async ensureWorktree(projectName) {
    const bareDir = join3(REPOS_BASE, projectName);
    const worktreeDir = join3(REPOS_BASE, `${projectName}-worktree`);
    return this.withLock(bareDir, async () => {
      try {
        if (!existsSync3(bareDir)) {
          throw new Error(`Bare repo missing: ${bareDir}`);
        }
        try {
          await this.git(bareDir, "fetch", "origin");
        } catch (e) {
          console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
        }
        const targetBranch = await this.resolveSharedWorktreeBranch(bareDir);
        console.log(`[RepoManager] ensureWorktree project=${projectName} branch=${targetBranch} path=${worktreeDir}`);
        if (existsSync3(worktreeDir)) {
          const isValid = await this.isValidWorktree(worktreeDir);
          if (!isValid) {
            console.warn(`[RepoManager] ensureWorktree found invalid worktree at ${worktreeDir}; recreating`);
            rmSync2(worktreeDir, { recursive: true, force: true });
            await this.git(bareDir, "worktree", "prune");
          }
        }
        if (!existsSync3(worktreeDir)) {
          await this.git(bareDir, "worktree", "add", worktreeDir, targetBranch);
          console.log(`[RepoManager] ensureWorktree created ${worktreeDir} on ${targetBranch}`);
        } else {
          await this.git(worktreeDir, "checkout", targetBranch);
          await this.git(worktreeDir, "reset", "--hard", targetBranch);
          console.log(`[RepoManager] ensureWorktree refreshed ${worktreeDir} on ${targetBranch}`);
        }
        return worktreeDir;
      } catch (error) {
        const message = getErrorMessage(error);
        console.error(`[RepoManager] ensureWorktree failed for ${projectName}: ${message}`);
        throw new Error(`ensureWorktree(${projectName}) failed: ${message}`);
      }
    });
  }
  async refreshWorktree(projectName) {
    const bareDir = join3(REPOS_BASE, projectName);
    const worktreeDir = join3(REPOS_BASE, `${projectName}-worktree`);
    if (!existsSync3(worktreeDir)) {
      return;
    }
    await this.withLock(bareDir, async () => {
      if (!existsSync3(worktreeDir)) {
        return;
      }
      const targetBranch = await this.resolveSharedWorktreeBranch(bareDir);
      const tempRef = `refs/zazig-refresh/${targetBranch}`;
      try {
        await this.git(bareDir, "fetch", "--refmap=", "origin", `+refs/heads/${targetBranch}:${tempRef}`);
      } catch (error) {
        console.warn(`[RepoManager] refreshWorktree: fetch FAILED for ${projectName}: ${getErrorMessage(error)}`);
        return;
      }
      let remoteHead;
      try {
        remoteHead = await this.git(bareDir, "rev-parse", tempRef);
      } catch {
        console.warn(`[RepoManager] refreshWorktree: temp ref missing after fetch for ${projectName}`);
        return;
      }
      const worktreeHead = await this.git(worktreeDir, "rev-parse", "HEAD");
      if (worktreeHead === remoteHead) {
        return;
      }
      const status = await this.git(worktreeDir, "status", "--porcelain");
      const isDirty = status.length > 0;
      if (isDirty) {
        await this.git(worktreeDir, "stash", "push", "-m", "zazig-auto-refresh");
        console.log(`[RepoManager] stashed dirty changes in ${projectName} before refresh`);
      }
      try {
        let isFastForward = false;
        try {
          await this.git(worktreeDir, "merge-base", "--is-ancestor", worktreeHead, remoteHead);
          isFastForward = true;
        } catch {
        }
        if (isFastForward) {
          await this.git(worktreeDir, "reset", "--hard", remoteHead);
          console.log(`[RepoManager] refreshed ${projectName}: ${worktreeHead.slice(0, 8)} \u2192 ${remoteHead.slice(0, 8)}`);
        } else {
          try {
            await this.git(worktreeDir, "rebase", remoteHead);
            const newHead = await this.git(worktreeDir, "rev-parse", "HEAD");
            console.log(`[RepoManager] rebased ${projectName} onto ${remoteHead.slice(0, 8)} (now ${newHead.slice(0, 8)})`);
          } catch {
            await this.git(worktreeDir, "rebase", "--abort").catch(() => {
            });
            console.error(`[RepoManager] CRITICAL: rebase failed for ${projectName} (local ${worktreeHead.slice(0, 8)} vs remote ${remoteHead.slice(0, 8)}) \u2014 skipping refresh`);
          }
        }
      } finally {
        if (isDirty) {
          try {
            await this.git(worktreeDir, "stash", "pop");
            console.log(`[RepoManager] restored stashed changes in ${projectName}`);
          } catch {
            console.warn(`[RepoManager] stash pop conflict in ${projectName} \u2014 changes saved in git stash`);
          }
        }
      }
    });
  }
  /**
   * Resolve the default branch in a bare repo.
   * Tries symbolic-ref HEAD first, then falls back to common names.
   */
  async resolveDefaultBranch(repoDir) {
    try {
      const ref = await this.git(repoDir, "symbolic-ref", "HEAD");
      const branchName = ref.replace(/^refs\/heads\//, "");
      await this.git(repoDir, "rev-parse", "--verify", `refs/heads/${branchName}`);
      return branchName;
    } catch {
    }
    for (const name of ["main", "master"]) {
      try {
        await this.git(repoDir, "rev-parse", "--verify", `refs/heads/${name}`);
        return name;
      } catch {
        continue;
      }
    }
    throw new Error(`Cannot resolve default branch in ${repoDir} \u2014 repo may be empty`);
  }
  /**
   * Shared worktrees historically use "master". If absent, fall back to
   * the repo's actual default branch.
   */
  async resolveSharedWorktreeBranch(repoDir) {
    try {
      await this.git(repoDir, "rev-parse", "--verify", "refs/heads/master");
      return "master";
    } catch {
      return this.resolveDefaultBranch(repoDir);
    }
  }
  async isValidWorktree(dir) {
    try {
      await this.git(dir, "rev-parse", "--git-dir");
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Create feature branch off default branch if not exists. Idempotent.
   * In a bare repo, branches fetched from origin live directly under refs/heads/,
   * so there are no origin/* tracking refs.
   */
  async ensureFeatureBranch(repoDir, featureBranch) {
    return this.withLock(repoDir, async () => {
      try {
        await this.git(repoDir, "fetch", "origin");
      } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }
      try {
        await this.git(repoDir, "rev-parse", "--verify", `refs/heads/${featureBranch}`);
        return;
      } catch {
      }
      const defaultBranch = await this.resolveDefaultBranch(repoDir);
      await this.git(repoDir, "branch", featureBranch, defaultBranch);
    });
  }
  async fetchBranchForExpert(projectName, branch) {
    const bareDir = join3(REPOS_BASE, projectName);
    return this.withLock(bareDir, async () => {
      await this.git(bareDir, "fetch", "--force", "origin", `+refs/heads/${branch}:refs/heads/${branch}`);
    });
  }
  /**
   * Create job/{jobId} branch off feature branch, then git worktree add.
   * Returns { worktreePath, jobBranch }.
   */
  async createJobWorktree(repoDir, featureBranch, jobId) {
    return this.withLock(repoDir, async () => {
      try {
        await this.git(repoDir, "fetch", "origin");
      } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }
      const jobBranch = `job/${jobId}`;
      const worktreePath = join3(WORKTREE_BASE, `job-${jobId}`);
      await mkdir(WORKTREE_BASE, { recursive: true });
      try {
        const wtList = await this.git(repoDir, "worktree", "list", "--porcelain");
        const entries = wtList.split("\n\n");
        for (const entry of entries) {
          if (entry.includes(`branch refs/heads/${jobBranch}`)) {
            const wtPath = entry.match(/^worktree (.+)$/m)?.[1];
            if (wtPath) {
              try {
                await this.git(repoDir, "worktree", "remove", "--force", wtPath);
              } catch {
              }
              try {
                await rm(wtPath, { recursive: true, force: true });
              } catch {
              }
            }
          }
        }
      } catch {
      }
      try {
        await rm(worktreePath, { recursive: true, force: true });
      } catch {
      }
      try {
        await this.git(repoDir, "worktree", "prune");
      } catch {
      }
      try {
        await this.git(repoDir, "branch", "-D", jobBranch);
      } catch {
      }
      await this.git(repoDir, "branch", jobBranch, featureBranch);
      await this.git(repoDir, "worktree", "add", worktreePath, jobBranch);
      return { worktreePath, jobBranch };
    });
  }
  /**
   * Create a job worktree that inherits code from dependency branches.
   * For single dep: branches from depBranches[0].
   * For fan-in (multiple deps): branches from depBranches[0], merges remaining.
   * Falls back to featureBranch if no dep branches are valid after verification.
   */
  async createDependentJobWorktree(repoDir, featureBranch, jobId, depBranches) {
    return this.withLock(repoDir, async () => {
      console.log(`[RepoManager] createDependentJobWorktree: jobId=${jobId}, depBranches=${JSON.stringify(depBranches)}`);
      try {
        await this.git(repoDir, "fetch", "origin");
      } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }
      const { stdout: branchList } = await execFileAsync("git", ["-C", repoDir, "branch", "--list", "job/*"], { encoding: "utf8" });
      console.log(`[RepoManager] Branches after fetch: ${branchList.trim().split("\n").map((b) => b.trim()).join(", ")}`);
      const validBranches = [];
      for (const branch of depBranches) {
        try {
          const { stdout: sha } = await execFileAsync("git", ["-C", repoDir, "rev-parse", "--verify", `refs/heads/${branch}`], { encoding: "utf8" });
          const { stdout: logLine } = await execFileAsync("git", ["-C", repoDir, "log", "--oneline", "-1", branch], { encoding: "utf8" });
          let ancestry = "UNKNOWN";
          try {
            await execFileAsync("git", ["-C", repoDir, "merge-base", "--is-ancestor", "HEAD~100", branch], { encoding: "utf8" });
            ancestry = "shares-history";
          } catch {
            try {
              const { stdout: roots } = await execFileAsync("git", ["-C", repoDir, "rev-list", "--max-parents=0", branch], { encoding: "utf8" });
              const { stdout: mainRoots } = await execFileAsync("git", ["-C", repoDir, "rev-list", "--max-parents=0", "master"], { encoding: "utf8" });
              ancestry = roots.trim() === mainRoots.trim() ? "same-root" : `DIFFERENT-ROOT(branch=${roots.trim().slice(0, 8)},master=${mainRoots.trim().slice(0, 8)})`;
            } catch {
              ancestry = "root-check-failed";
            }
          }
          console.log(`[RepoManager] Dep branch "${branch}": sha=${sha.trim().slice(0, 8)}, log="${logLine.trim()}", ancestry=${ancestry}`);
          validBranches.push(branch);
        } catch {
          console.warn(`[RepoManager] createDependentJobWorktree: dep branch "${branch}" not found in ${repoDir} \u2014 skipping`);
        }
      }
      const jobBranch = `job/${jobId}`;
      const worktreePath = join3(WORKTREE_BASE, `job-${jobId}`);
      await mkdir(WORKTREE_BASE, { recursive: true });
      const baseBranch = validBranches.length > 0 ? validBranches[0] : featureBranch;
      console.log(`[RepoManager] Creating jobBranch="${jobBranch}" from baseBranch="${baseBranch}", validBranches=${JSON.stringify(validBranches)}`);
      try {
        const wtList = await this.git(repoDir, "worktree", "list", "--porcelain");
        const entries = wtList.split("\n\n");
        for (const entry of entries) {
          if (entry.includes(`branch refs/heads/${jobBranch}`)) {
            const wtPath = entry.match(/^worktree (.+)$/m)?.[1];
            if (wtPath) {
              try {
                await this.git(repoDir, "worktree", "remove", "--force", wtPath);
              } catch {
              }
              try {
                await rm(wtPath, { recursive: true, force: true });
              } catch {
              }
            }
          }
        }
      } catch {
      }
      try {
        await rm(worktreePath, { recursive: true, force: true });
      } catch {
      }
      try {
        await this.git(repoDir, "worktree", "prune");
      } catch {
      }
      try {
        await this.git(repoDir, "branch", "-D", jobBranch);
      } catch {
      }
      await this.git(repoDir, "branch", jobBranch, baseBranch);
      await this.git(repoDir, "worktree", "add", worktreePath, jobBranch);
      for (const branch of validBranches.slice(1)) {
        console.log(`[RepoManager] Fan-in merging "${branch}" into worktree at ${worktreePath}`);
        try {
          await execFileAsync("git", ["-C", worktreePath, "merge", "--no-ff", branch], { encoding: "utf8" });
          console.log(`[RepoManager] Fan-in merge of "${branch}" succeeded`);
        } catch (mergeErr) {
          try {
            await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" });
          } catch {
          }
          await this.git(repoDir, "worktree", "remove", "--force", worktreePath);
          try {
            await this.git(repoDir, "branch", "-D", jobBranch);
          } catch {
          }
          throw new Error(`Fan-in merge of "${branch}" into job/${jobId} failed: ${String(mergeErr)}`);
        }
      }
      return { worktreePath, jobBranch };
    });
  }
  /**
   * Push job branch to origin from within the worktree.
   */
  async pushJobBranch(worktreePath, jobBranch) {
    await execFileAsync("git", ["-C", worktreePath, "push", "--force", "origin", jobBranch], {
      encoding: "utf8"
    });
  }
  /**
   * Remove worktree (branch persists on remote). Uses --force since the worktree
   * may have uncommitted changes from a failed agent.
   */
  async removeJobWorktree(repoDir, worktreePath) {
    try {
      await this.git(repoDir, "worktree", "remove", "--force", worktreePath);
    } catch {
    }
  }
};

// ../local-agent/dist/executor.js
function resolveMcpServerPath() {
  const thisDir = dirname2(fileURLToPath(import.meta.url));
  const mjsPath = join4(thisDir, "agent-mcp-server.mjs");
  if (existsSync4(mjsPath))
    return mjsPath;
  return join4(thisDir, "agent-mcp-server.js");
}
var execFileAsync2 = promisify2(execFile2);
var POLL_INTERVAL_MS = 3e4;
var SLOT_RECONCILE_INTERVAL_MS = 6e4;
var PR_MONITOR_INTERVAL_MS = 6e4;
var JOB_TIMEOUT_MS = 60 * 6e4;
var STUCK_NO_OUTPUT_MS = 5 * 6e4;
var INTERACTIVE_JOB_TIMEOUT_MS = 30 * 6e4;
function reportRelativePath(role) {
  const reportFile = role ? `${role}-report.md` : "cpo-report.md";
  return `.claude/${reportFile}`;
}
var REPORT_ARCHIVE_DIR = ".claude/job-reports";
var NO_CODE_CONTEXT_ROLES = /* @__PURE__ */ new Set([
  "pipeline-technician",
  "monitoring-agent",
  "project-architect",
  "triage-analyst"
]);
var CPO_STARTUP_DELAY_MS = 15e3;
var DEFAULT_BOOT_PROMPT = "Read your state files. If .claude/{role}-report.md exists, review it for continuity. Check for pending work via your MCP tools. Orient yourself and begin.";
var MIN_SESSION_AGE_MS = 5 * 6e4;
var RESET_FAILURE_WINDOW_MS = 10 * 6e4;
var MAX_RESET_FAILURES = 3;
var MAX_QUEUE_SIZE = 20;
var JOB_LOG_DIR = join4(homedir2(), ".zazigv2", "job-logs");
function buildScratchWorkspaceDir(companyId, role, jobId) {
  const resolvedCompany = companyId && companyId.trim().length > 0 ? companyId : "unknown-company";
  return join4(homedir2(), ".zazigv2", `${resolvedCompany}-${role}-${jobId}`);
}
function clearJobLogs(jobId) {
  try {
    mkdirSync2(JOB_LOG_DIR, { recursive: true });
    writeFileSync2(join4(JOB_LOG_DIR, `${jobId}-pre-post.log`), "");
    writeFileSync2(join4(JOB_LOG_DIR, `${jobId}-pipe-pane.log`), "");
  } catch {
  }
}
function resolveRepoRoot() {
  const thisDir = dirname2(fileURLToPath(import.meta.url));
  const candidates = [
    resolve2(thisDir, "..", "..", ".."),
    process.cwd()
  ];
  for (const candidate of candidates) {
    const hasPipelineSkills = existsSync4(join4(candidate, "projects", "skills"));
    const hasInteractiveSkills = existsSync4(join4(candidate, ".claude", "skills"));
    if (hasPipelineSkills && hasInteractiveSkills)
      return candidate;
  }
  console.warn(`[executor] Could not resolve repo root from runtime path; using process.cwd()=${process.cwd()}`);
  return process.cwd();
}
function jobLog(jobId, message) {
  try {
    mkdirSync2(JOB_LOG_DIR, { recursive: true });
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}
`;
    appendFileSync2(join4(JOB_LOG_DIR, `${jobId}-pre-post.log`), line);
  } catch {
  }
}
var SKILLS_MARKER = "<!-- SKILLS -->";
function ensureRoleSkills(role, roleSkills) {
  const normalized = roleSkills ? [...roleSkills] : [];
  if (role === "cpo" && !normalized.includes("start-expert")) {
    normalized.push("start-expert");
  }
  return normalized.length > 0 ? normalized : void 0;
}
function normalizeCompanyProjects(raw) {
  if (!Array.isArray(raw))
    return [];
  const normalized = [];
  for (const project of raw) {
    if (!project || typeof project !== "object")
      continue;
    const name = project.name;
    const repoUrl = project.repo_url;
    if (typeof name !== "string" || name.trim().length === 0)
      continue;
    if (repoUrl !== null && (typeof repoUrl !== "string" || repoUrl.trim().length === 0))
      continue;
    normalized.push({ name: name.trim(), repo_url: repoUrl ?? null });
  }
  return normalized;
}
function enqueueWithCap(queue, message, maxSize) {
  queue.push(message);
  if (queue.length > maxSize) {
    const notifIdx = queue.findIndex((m) => m.type === "notification");
    if (notifIdx !== -1) {
      const dropped = queue.splice(notifIdx, 1)[0];
      console.log(`[daemon] Dropped notification message due to queue cap: ${dropped.text.slice(0, 80)}`);
    } else {
      console.warn("[daemon] Queue cap exceeded but no notification messages to drop \u2014 queue contains only human messages");
    }
  }
}
var JobExecutor = class {
  machineId;
  companyId;
  slots;
  send;
  supabase;
  afterJobComplete;
  supabaseUrl;
  supabaseAnonKey;
  /** Map of jobId → active job state. */
  activeJobs = /* @__PURE__ */ new Map();
  /** Jobs that have been attempted (including failures) — prevents duplicate dispatch. */
  /** Manages bare repo clones and job worktrees for all dispatched jobs. */
  repoManager = new RepoManager();
  /** Map of role → active persistent agent state. Supports simultaneous CPO, CTO, etc. */
  persistentAgents = /* @__PURE__ */ new Map();
  /** Cached machine UUID for persistent_agents DB writes. */
  machineUuid = null;
  /** Message queue for injecting into persistent agent tmux sessions. */
  messageQueue = [];
  processingQueue = false;
  reconcileTimer = null;
  prMonitorTimer = null;
  companyProjects = [];
  constructor(machineId, companyId, slots, send, supabase, supabaseUrl, supabaseAnonKey, afterJobComplete) {
    this.machineId = machineId;
    this.companyId = companyId;
    this.slots = slots;
    this.send = send;
    this.supabase = supabase;
    this.supabaseUrl = supabaseUrl;
    this.supabaseAnonKey = supabaseAnonKey;
    this.afterJobComplete = afterJobComplete;
    this.reconcileTimer = setInterval(() => {
      void this.reconcileSlots();
    }, SLOT_RECONCILE_INTERVAL_MS);
    this.prMonitorTimer = setInterval(() => {
      void this.monitorMergedPRs();
    }, PR_MONITOR_INTERVAL_MS);
  }
  setCompanyProjects(projects) {
    this.companyProjects = [...projects];
  }
  getCompanyProjects() {
    return [...this.companyProjects];
  }
  /** Resolve the machine UUID from the machines table (cached after first call). */
  async resolveMachineUuid(companyId) {
    if (this.machineUuid)
      return this.machineUuid;
    const { data, error } = await this.supabase.from("machines").select("id").eq("company_id", companyId).eq("name", this.machineId).single();
    if (error || !data) {
      console.warn(`[executor] Could not resolve machine UUID for "${this.machineId}": ${error?.message ?? "not found"}`);
      return null;
    }
    this.machineUuid = data.id;
    return data.id;
  }
  async loadPersistentRoleConfig(role) {
    const { data, error } = await this.supabase.from("roles").select("prompt, heartbeat_md, cache_ttl_minutes, hard_ttl_minutes, boot_prompt").eq("name", role).single();
    if (error) {
      throw new Error(`Failed to load role config for ${role}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Role ${role} not found in DB`);
    }
    return {
      prompt: data.prompt ?? "",
      heartbeatMd: data.heartbeat_md ?? "",
      cacheTtlMinutes: data.cache_ttl_minutes ?? 30,
      hardTtlMinutes: data.hard_ttl_minutes ?? 240,
      bootPrompt: data.boot_prompt ?? null
    };
  }
  buildHeartbeatSessionStartCommand() {
    return [
      "cat <<'HEARTBEAT_EOF'",
      "Read .claude/HEARTBEAT.md for your recurring tasks.",
      "Read .claude/memory/heartbeat-state.json for what you've already completed.",
      "Skip any Daily task completed today. Skip any Weekly task completed this week.",
      "After completing tasks, update heartbeat-state.json with new timestamps.",
      "HEARTBEAT_EOF"
    ].join("\n");
  }
  refreshPersistentPromptStack(promptStackMinusSkills, previousRolePrompt, nextRolePrompt) {
    if (!promptStackMinusSkills) {
      return promptStackMinusSkills;
    }
    if (previousRolePrompt && promptStackMinusSkills.includes(previousRolePrompt)) {
      return promptStackMinusSkills.replace(previousRolePrompt, nextRolePrompt);
    }
    return promptStackMinusSkills;
  }
  async withExpertRosterSection(claudeMdContent) {
    const { data, error } = await this.supabase.from("expert_roles").select("name, display_name, description");
    if (error) {
      console.warn(`[executor] Failed to load expert_roles: ${error.message}`);
      return claudeMdContent;
    }
    const expertRoles = data ?? [];
    if (expertRoles.length === 0)
      return claudeMdContent;
    const rosterLines = expertRoles.map((role) => {
      const displayName = role.display_name?.trim() || role.name;
      const description = role.description?.replace(/\s+/g, " ").trim() || "No description provided.";
      return `- **${role.name}** (${displayName}): ${description}`;
    });
    const rosterSection = [
      "",
      "## Expert Agents Available",
      "",
      "You can trigger expert agents for specialized work. Call the start_expert_session MCP tool to spawn one.",
      "",
      ...rosterLines,
      "",
      "Proactively suggest expert sessions when the task requires specialized expertise."
    ].join("\n");
    return `${claudeMdContent}${rosterSection}`;
  }
  async resolvePersistentProjects(msg, companyId) {
    const fromMessage = normalizeCompanyProjects(msg.companyProjects);
    if (fromMessage.length > 0) {
      return fromMessage;
    }
    if (!companyId) {
      return [];
    }
    const { data, error } = await this.supabase.from("projects").select("name, repo_url").eq("company_id", companyId).eq("status", "active");
    if (error) {
      console.warn(`[executor] Failed to load projects for persistent agent company ${companyId}: ${error.message}`);
      return [];
    }
    return normalizeCompanyProjects(data);
  }
  // ---------------------------------------------------------------------------
  // Public: StartJob
  // ---------------------------------------------------------------------------
  async handleStartJob(msg) {
    const { jobId, slotType, complexity, model } = msg;
    clearJobLogs(jobId);
    jobLog(jobId, `START handleStartJob \u2014 slotType=${slotType}, complexity=${complexity}, model=${model}, role=${msg.role ?? "none"}, cardType=${msg.cardType}`);
    console.log(`[executor] handleStartJob \u2014 jobId=${jobId}, slotType=${slotType}, complexity=${complexity}, model=${model}`);
    if (this.activeJobs.has(jobId)) {
      jobLog(jobId, `SKIP duplicate start_job \u2014 already running`);
      console.warn(`[executor] Duplicate start_job ignored for jobId=${jobId} (currently active)`);
      return;
    }
    try {
      await this._handleStartJobInner(msg);
    } catch (err) {
      jobLog(jobId, `FATAL handleStartJob crashed: ${String(err)}`);
      console.error(`[executor] FATAL handleStartJob crashed for jobId=${jobId}:`, err);
      try {
        this.slots.release(slotType);
      } catch {
      }
      try {
        await this.sendJobFailed(jobId, `Agent crash: ${String(err)}`, "agent_crash");
      } catch {
      }
    }
  }
  async _handleStartJobInner(msg) {
    const { jobId, slotType, complexity, model } = msg;
    if (msg.cardType === "persistent_agent") {
      await this.sendJobAck(jobId);
      await this.handlePersistentJob(jobId, msg, slotType);
      return;
    }
    const slotAcquired = this.slots.tryAcquire(slotType);
    if (slotAcquired) {
      jobLog(jobId, `Slot acquired: ${slotType}`);
    } else {
      jobLog(jobId, `WARN slot overcommit: running despite no free ${slotType} slot`);
      console.warn(`[executor] Slot overcommit for jobId=${jobId} \u2014 running anyway (${slotType})`);
    }
    await this.sendJobAck(jobId);
    const isInteractive = msg.interactive === true;
    const roleName = msg.role ?? "senior-engineer";
    const roleSkills = ensureRoleSkills(roleName, msg.roleSkills);
    const repoRoot = resolveRepoRoot();
    const assembledContext = assembleContext(msg, repoRoot);
    const cpoContext = roleName === "cpo" ? await this.withExpertRosterSection(assembledContext) : assembledContext;
    console.log(`[executor] Assembled context for jobId=${jobId}:
${cpoContext}`);
    let ephemeralWorkspaceDir;
    let worktreePath;
    let repoDir;
    let jobBranch;
    let startingCommit;
    const requiresCodeContext = !NO_CODE_CONTEXT_ROLES.has(roleName);
    const cleanupPreparedWorkspace = async () => {
      if (worktreePath && repoDir) {
        await this.repoManager.removeJobWorktree(repoDir, worktreePath);
      } else if (ephemeralWorkspaceDir) {
        cleanupJobWorkspace(jobId, ephemeralWorkspaceDir);
      }
    };
    try {
      if (requiresCodeContext) {
        if (!msg.repoUrl || !msg.featureBranch) {
          throw new Error("Missing repoUrl/featureBranch for code-context role");
        }
        const projectName = msg.repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? jobId;
        repoDir = await this.repoManager.ensureRepo(msg.repoUrl, projectName);
        await this.repoManager.ensureFeatureBranch(repoDir, msg.featureBranch);
        const routing = msg.dependencyBranches && msg.dependencyBranches.length > 0 ? "createDependentJobWorktree" : "createJobWorktree";
        clearJobLogs(jobId);
        let buildCommit = "unknown";
        try {
          const agentDir = dirname2(fileURLToPath(import.meta.url));
          const { stdout } = await execFileAsync2("git", ["log", "-1", "--format=%h %s"], { cwd: agentDir });
          buildCommit = stdout.trim();
        } catch {
        }
        jobLog(jobId, `Agent=${roleName} slot=${slotType} model=${msg.model} build=${buildCommit}`);
        jobLog(jobId, `Branch routing: dependencyBranches=${JSON.stringify(msg.dependencyBranches)}, using=${routing}`);
        jobLog(jobId, `featureBranch=${msg.featureBranch}, repoDir=${repoDir}`);
        console.log(`[executor] Branch routing for jobId=${jobId}: dependencyBranches=${JSON.stringify(msg.dependencyBranches)}, using=${routing}`);
        const worktreeResult = msg.dependencyBranches && msg.dependencyBranches.length > 0 ? await this.repoManager.createDependentJobWorktree(repoDir, msg.featureBranch, jobId, msg.dependencyBranches) : await this.repoManager.createJobWorktree(repoDir, msg.featureBranch, jobId);
        worktreePath = worktreeResult.worktreePath;
        jobBranch = worktreeResult.jobBranch;
        ephemeralWorkspaceDir = worktreePath;
        jobLog(jobId, `Worktree created at ${worktreePath} (branch: ${jobBranch})`);
        console.log(`[executor] Git worktree created at ${worktreePath} (branch: ${jobBranch}) for jobId=${jobId}`);
        if (msg.slotType === "codex") {
          try {
            const { stdout } = await execFileAsync2("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
            startingCommit = stdout.trim();
          } catch {
          }
        }
      } else {
        ephemeralWorkspaceDir = buildScratchWorkspaceDir(this.companyId, roleName, jobId);
        mkdirSync2(ephemeralWorkspaceDir, { recursive: true });
        jobLog(jobId, `Scratch workspace created at ${ephemeralWorkspaceDir} (no git context role=${roleName})`);
        console.log(`[executor] Scratch workspace created at ${ephemeralWorkspaceDir} for no-code role ${roleName} jobId=${jobId}`);
      }
    } catch (err) {
      jobLog(jobId, `FAILED to prepare workspace: ${String(err)}`);
      console.error(`[executor] Failed to prepare workspace for jobId=${jobId}:`, err);
      if (slotAcquired)
        this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to prepare workspace: ${String(err)}`, "agent_crash");
      return;
    }
    const mcpServerPath = resolveMcpServerPath();
    try {
      setupJobWorkspace({
        workspaceDir: ephemeralWorkspaceDir,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId,
        companyId: this.companyId,
        role: roleName,
        claudeMdContent: cpoContext,
        skills: roleSkills,
        repoSkillsDir: join4(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join4(repoRoot, ".claude", "skills"),
        mcpTools: msg.roleMcpTools,
        tmuxSession: `${this.machineId}-${jobId}`,
        machineId: this.machineId
      });
      console.log(`[executor] Workspace overlay written to ${ephemeralWorkspaceDir} for jobId=${jobId}`);
    } catch (err) {
      console.warn(`[executor] Failed to write workspace overlay for jobId=${jobId}: ${String(err)}`);
    }
    let cmd;
    let cmdArgs;
    const promptFilePath = join4(ephemeralWorkspaceDir, ".zazig-prompt.txt");
    if (isInteractive) {
      const resolvedModel = msg.model && msg.model !== "codex" ? msg.model : "claude-sonnet-4-6";
      cmd = "claude";
      cmdArgs = ["--model", resolvedModel];
    } else {
      const built = buildCommand(slotType, complexity, model, worktreePath, promptFilePath, repoDir);
      cmd = built.cmd;
      cmdArgs = built.args;
    }
    const sessionName = `${this.machineId}-${jobId}`;
    mkdirSync2(ephemeralWorkspaceDir, { recursive: true });
    writeFileSync2(promptFilePath, cpoContext);
    const reportPath = `${process.env["HOME"] ?? "/tmp"}/${reportRelativePath(msg.role)}`;
    try {
      unlinkSync(reportPath);
    } catch {
    }
    if (msg.role === "reviewer" && worktreePath) {
      try {
        unlinkSync(`${worktreePath}/.claude/reviewer-report.md`);
      } catch {
      }
    }
    if (await isTmuxSessionAlive(sessionName)) {
      console.warn(`[executor] Stale tmux session ${sessionName} exists \u2014 killing before respawn`);
      await killTmuxSession(sessionName);
    }
    try {
      if (isInteractive) {
        const claudeCmd = shellEscape([cmd, ...cmdArgs]);
        const shellCmd = `unset CLAUDECODE; ${claudeCmd}`;
        await execFileAsync2("tmux", [
          "new-session",
          "-d",
          "-s",
          sessionName,
          ...ephemeralWorkspaceDir ? ["-c", ephemeralWorkspaceDir] : [],
          shellCmd
        ]);
        setTimeout(async () => {
          try {
            await execFileAsync2("tmux", ["send-keys", "-t", sessionName, "Enter"]);
            jobLog(jobId, "Sent Enter to dismiss trust prompt");
          } catch (err) {
            jobLog(jobId, `Failed to dismiss trust prompt: ${err}`);
          }
        }, 3e3);
        setTimeout(async () => {
          try {
            const promptText = readFileSync3(promptFilePath, "utf8");
            await execFileAsync2("tmux", ["send-keys", "-t", sessionName, "-l", promptText]);
            await new Promise((resolve4) => setTimeout(resolve4, 2e3));
            await execFileAsync2("tmux", ["send-keys", "-t", sessionName, "Enter"]);
            jobLog(jobId, `Injected prompt into interactive session (${promptText.length} chars)`);
          } catch (err) {
            jobLog(jobId, `Failed to inject prompt: ${err}`);
          }
        }, CPO_STARTUP_DELAY_MS);
      } else {
        await spawnTmuxSession(sessionName, cmd, cmdArgs, ephemeralWorkspaceDir, slotType === "codex" ? void 0 : promptFilePath);
      }
    } catch (err) {
      console.error(`[executor] Failed to spawn tmux session for jobId=${jobId}:`, err);
      await cleanupPreparedWorkspace();
      if (slotAcquired)
        this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to start tmux session: ${String(err)}`, "agent_crash");
      return;
    }
    const logPath2 = jobLogPath(jobId);
    const activeJob = {
      jobId,
      slotType,
      slotAcquired,
      sessionName,
      pollTimer: null,
      timeoutTimer: null,
      settled: false,
      startedAt: Date.now(),
      logPath: logPath2,
      lastBytesSent: 0,
      lastLifecycleBytesSent: 0,
      workspaceDir: ephemeralWorkspaceDir,
      worktreePath,
      repoDir,
      jobBranch,
      role: msg.role,
      cardType: msg.cardType,
      repoUrl: msg.repoUrl ?? void 0,
      featureBranch: msg.featureBranch ?? void 0,
      spec: msg.spec,
      acceptanceCriteria: msg.acceptanceCriteria,
      jobTitle: msg.title,
      startingCommit,
      attempt: 1,
      maxAttempts: 3,
      fixReasons: [],
      complexity: msg.complexity,
      model: msg.model
    };
    console.log(`[codex] Starting job \u2014 title="${activeJob.jobTitle ?? jobId}", id=${jobId.slice(0, 8)}, complexity=${msg.complexity}, attempt=${activeJob.attempt}/${activeJob.maxAttempts}`);
    jobLog(jobId, `Tmux session started \u2014 session=${sessionName}, cmd=${cmd} ${cmdArgs.join(" ")}, cwd=${ephemeralWorkspaceDir ?? "none"}`);
    console.log(`[executor] Tmux session started \u2014 session=${sessionName}, cmd=${cmd}`);
    try {
      mkdirSync2(JOB_LOG_DIR, { recursive: true });
      await startPipePane(sessionName, logPath2);
      jobLog(jobId, `pipe-pane started \u2192 ${logPath2}`);
    } catch (err) {
      jobLog(jobId, `pipe-pane FAILED: ${String(err)}`);
      console.warn(`[executor] pipe-pane start failed for jobId=${jobId}: ${String(err)}`);
    }
    if (process.env["ZAZIG_OPEN_SESSIONS"]) {
      execFile2("bash", ["-c", `ghostty -e bash -c 'tmux attach -t ${sessionName}'`], (err) => {
        if (err)
          console.warn(`[executor] Could not open Ghostty window: ${err.message}`);
      });
    }
    await this.sendJobStatus(jobId, "executing");
    this.activeJobs.set(jobId, activeJob);
    activeJob.timeoutTimer = setTimeout(() => {
      void this.onJobTimeout(jobId);
    }, isInteractive ? INTERACTIVE_JOB_TIMEOUT_MS : JOB_TIMEOUT_MS);
    activeJob.pollTimer = setInterval(() => {
      this.pollJob(jobId).catch((err) => {
        jobLog(jobId, `pollJob CRASHED: ${String(err)}`);
        console.error(`[executor] pollJob crashed for jobId=${jobId}:`, err);
      });
    }, POLL_INTERVAL_MS);
    jobLog(jobId, `Poll timer started (interval=${POLL_INTERVAL_MS}ms)`);
  }
  // ---------------------------------------------------------------------------
  // Public: Spawn a persistent agent from a job definition
  // ---------------------------------------------------------------------------
  /**
   * Spawns a persistent agent from a company-persistent-jobs definition.
   * Builds a synthetic StartJob-like message and delegates to handlePersistentJob.
   */
  async spawnPersistentAgent(job, companyId) {
    const syntheticMsg = {
      type: "start_job",
      protocolVersion: 1,
      jobId: `persistent-${job.role}-${companyId}`,
      cardId: `persistent-${job.role}`,
      cardType: "persistent_agent",
      complexity: "medium",
      slotType: job.slot_type,
      model: job.model,
      role: job.role,
      promptStackMinusSkills: job.prompt_stack_minus_skills,
      ...job.sub_agent_prompt ? { subAgentPrompt: job.sub_agent_prompt } : {},
      roleSkills: job.skills?.length ? job.skills : void 0,
      roleMcpTools: job.mcp_tools?.length ? job.mcp_tools : void 0,
      companyProjects: job.projects?.length ? job.projects : void 0
    };
    await this.handlePersistentJob(`persistent-${job.role}`, syntheticMsg, syntheticMsg.slotType, companyId);
  }
  hasPersistentAgent(role) {
    return this.persistentAgents.has(role);
  }
  /**
   * Hot-reload a running persistent role.
   * Reuses the normal spawn path so CLAUDE.md assembly and tmux startup stay consistent.
   */
  async reloadPersistentAgent(job, companyId) {
    const existing = this.persistentAgents.get(job.role);
    if (!existing) {
      console.log(`[executor] reloadPersistentAgent skipped \u2014 no active agent for role=${job.role}`);
      return;
    }
    const activeJob = this.activeJobs.get(existing.jobId);
    if (activeJob) {
      activeJob.settled = true;
      this.clearJobTimers(activeJob);
      this.activeJobs.delete(existing.jobId);
    } else {
      console.warn(`[executor] reloadPersistentAgent: active job missing for role=${job.role}, jobId=${existing.jobId}`);
    }
    this.clearPersistentAgent(job.role);
    await this.spawnPersistentAgent(job, companyId);
  }
  // ---------------------------------------------------------------------------
  // Public: MessageInbound
  // ---------------------------------------------------------------------------
  /**
   * Handles an inbound message from an external platform (Slack, Discord, etc.)
   * by formatting it and injecting into the target persistent agent's tmux session.
   * Messages are queued and injected one at a time.
   *
   * Routing: uses msg.role when present; falls back to the single running agent
   * (backward-compatible with single-role deployments where role is omitted).
   */
  handleMessageInbound(msg) {
    if (this.persistentAgents.size === 0) {
      console.warn(`[executor] MessageInbound dropped \u2014 no persistent agents running. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }
    const targetRole = msg.role ?? (this.persistentAgents.size === 1 ? this.persistentAgents.keys().next().value : void 0);
    if (!targetRole) {
      console.warn(`[executor] MessageInbound dropped \u2014 multiple persistent agents running but no role specified. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }
    const agent = this.persistentAgents.get(targetRole);
    if (!agent) {
      console.warn(`[executor] MessageInbound dropped \u2014 no persistent agent for role=${targetRole}. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }
    const formatted = `[Message from ${msg.from}, conversation:${msg.conversationId}]
${msg.text}`;
    console.log(`[executor] Queuing inbound message from ${msg.from} for role=${targetRole} session=${agent.tmuxSession}`);
    void this.enqueueMessage(formatted, agent.tmuxSession, agent.startedAt);
  }
  // ---------------------------------------------------------------------------
  // Public: StopJob
  // ---------------------------------------------------------------------------
  /** Returns the job IDs of all currently executing jobs. */
  getActiveJobIds() {
    return Array.from(this.activeJobs.keys());
  }
  /** Stops a single active job by ID using the standard stop flow. */
  async stopJob(jobId) {
    await this.handleStopJob({
      type: "stop_job",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      reason: "graceful_shutdown"
    });
  }
  async killAllRunningJobs(reason) {
    const jobIds = [...this.activeJobs.keys()];
    let killed = 0;
    for (const jobId of jobIds) {
      const job = this.activeJobs.get(jobId);
      if (!job || job.settled)
        continue;
      job.settled = true;
      this.clearJobTimers(job);
      jobLog(jobId, `Force-killed by daemon \u2014 reason=${reason}`);
      try {
        await killTmuxSession(job.sessionName);
      } catch (err) {
        console.warn(`[executor] Failed to kill tmux session for jobId=${jobId}: ${String(err)}`);
      }
      try {
        await this.sendJobFailed(jobId, `Daemon killed job: ${reason}`, reason);
      } catch (err) {
        console.warn(`[executor] Failed to report forced failure for jobId=${jobId}: ${String(err)}`);
      } finally {
        try {
          await this.settleJob(jobId);
        } catch (err) {
          console.warn(`[executor] Failed to settle force-killed jobId=${jobId}: ${String(err)}`);
        }
      }
      killed++;
    }
    return killed;
  }
  // Public: JobUnblocked
  // ---------------------------------------------------------------------------
  /**
   * Handles a job_unblocked message from the orchestrator.
   * For V1: the orchestrator already updated the job context in the DB.
   * If the tmux session is still alive, the agent will pick up the answer
   * from its DB context on next iteration. If the session died, the
   * dispatcher will re-pick the job since it's now back to `executing`.
   */
  async handleJobUnblocked(msg) {
    const job = this.activeJobs.get(msg.jobId);
    if (!job) {
      console.log(`[executor] JobUnblocked for unknown jobId=${msg.jobId} \u2014 session may have died, dispatcher will re-pick`);
      return;
    }
    console.log(`[executor] JobUnblocked \u2014 jobId=${msg.jobId}, session=${job.sessionName} still alive, agent will read answer from DB context`);
  }
  // ---------------------------------------------------------------------------
  // Public: Graceful shutdown
  // ---------------------------------------------------------------------------
  /**
   * Stops all active jobs. Called by the process shutdown handler before
   * disconnecting from Supabase.
   */
  async stopAll() {
    if (this.reconcileTimer !== null) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    if (this.prMonitorTimer !== null) {
      clearInterval(this.prMonitorTimer);
      this.prMonitorTimer = null;
    }
    this.clearPersistentAgent();
    for (const [, job] of this.activeJobs) {
      this.clearJobTimers(job);
      await killTmuxSession(job.sessionName);
      if (job.worktreePath && job.repoDir) {
        await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
      } else {
        cleanupJobWorkspace(job.jobId, job.workspaceDir);
      }
      if (job.slotAcquired)
        this.slots.release(job.slotType);
    }
    this.activeJobs.clear();
  }
  /**
   * Monitors features in pr_ready status for merged PRs.
   * When a PR is detected as merged via `gh` CLI, advances the feature to complete.
   */
  async monitorMergedPRs() {
    const { data: features } = await this.supabase.from("features").select("id, pr_url, company_id").eq("status", "pr_ready").not("pr_url", "is", null).limit(50);
    if (!features || features.length === 0)
      return;
    for (const feature of features) {
      try {
        const { stdout } = await execFileAsync2("gh", [
          "pr",
          "view",
          feature.pr_url,
          "--json",
          "state"
        ], { encoding: "utf8" });
        const { state } = JSON.parse(stdout);
        if (state === "MERGED") {
          const { data: updated } = await this.supabase.from("features").update({ status: "complete", completed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", feature.id).eq("status", "pr_ready").select("id");
          if (updated?.length) {
            await this.supabase.from("events").insert({
              company_id: feature.company_id,
              event_type: "feature_status_changed",
              detail: { featureId: feature.id, from: "pr_ready", to: "complete", reason: "pr_merged" }
            });
            console.log(`[executor] PR merged \u2014 feature ${feature.id} \u2192 complete`);
          }
        }
      } catch {
      }
    }
  }
  /**
   * Reconciles in-memory active jobs with DB terminal status.
   * This closes slot leaks when jobs are externally marked terminal in the DB
   * without a matching StopJob reaching this daemon.
   */
  async reconcileSlots() {
    try {
      const activeJobIds = [...this.activeJobs.values()].filter((job) => !job.settled && !this.isPersistentJob(job.jobId)).map((job) => job.jobId);
      if (activeJobIds.length === 0)
        return;
      const { data, error } = await this.supabase.from("jobs").select("id,status").in("id", activeJobIds);
      if (error) {
        console.warn(`[executor] Slot reconciliation query failed: ${error.message}`);
        return;
      }
      if (!data || data.length === 0)
        return;
      const terminalStatuses = /* @__PURE__ */ new Set(["failed", "complete", "cancelled"]);
      for (const row of data) {
        if (!terminalStatuses.has(row.status))
          continue;
        const job = this.activeJobs.get(row.id);
        if (!job || job.settled || this.isPersistentJob(job.jobId))
          continue;
        console.log(`[executor] Slot reconciliation: job ${job.jobId} externally terminated (DB status=${row.status}), releasing slot`);
        try {
          await this.teardownReconciledJob(job);
        } catch (teardownErr) {
          console.warn(`[executor] Slot reconciliation teardown failed for job ${job.jobId}: ${String(teardownErr)}`);
        }
      }
    } catch (err) {
      console.warn(`[executor] Slot reconciliation failed: ${String(err)}`);
    }
  }
  isPersistentJob(jobId) {
    return jobId.startsWith("persistent-");
  }
  async teardownReconciledJob(job) {
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(job.jobId);
    const sessionAlive = await isTmuxSessionAlive(job.sessionName);
    if (sessionAlive) {
      await killTmuxSession(job.sessionName);
    }
    if (job.worktreePath && job.repoDir) {
      await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(job.jobId, job.workspaceDir);
    }
    if (job.slotAcquired)
      this.slots.release(job.slotType);
  }
  // ---------------------------------------------------------------------------
  // Private: Persistent agent (role-agnostic)
  // ---------------------------------------------------------------------------
  /**
   * Handles a start_job for a persistent agent (cardType === "persistent_agent").
   *
   * Unlike regular jobs the persistent session:
   *   - Runs Claude Code in interactive TUI mode (not -p print mode)
   *   - Has no poll/timeout timers — it runs indefinitely until StopJob
   *   - Receives inbound messages via handleMessageInbound (injected into tmux)
   *
   * Before spawning, creates an agent workspace at ~/.zazigv2/{role}-workspace/
   * with a .mcp.json that gives the agent access to the zazig-messaging MCP server.
   * CLAUDE.md content comes from assembleContext(msg) (promptStackMinusSkills with skills inserted).
   */
  async handlePersistentJob(jobId, msg, slotType, companyId) {
    const role = msg.role ?? "agent";
    const roleSkills = ensureRoleSkills(role, msg.roleSkills);
    const resolvedCompanyId = companyId ?? process.env["ZAZIG_COMPANY_ID"] ?? "";
    const workspaceDir = resolvedCompanyId ? join4(homedir2(), ".zazigv2", `${resolvedCompanyId}-${role}-workspace`) : join4(homedir2(), ".zazigv2", `${role}-workspace`);
    let roleConfig;
    try {
      const repoRoot = resolveRepoRoot();
      roleConfig = await this.loadPersistentRoleConfig(role);
      const mcpServerPath = resolveMcpServerPath();
      const assembledContext = assembleContext(msg, repoRoot);
      const claudeMdContent = role === "cpo" ? await this.withExpertRosterSection(assembledContext) : assembledContext;
      setupJobWorkspace({
        workspaceDir,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId,
        companyId: resolvedCompanyId,
        role,
        claudeMdContent,
        heartbeatMd: roleConfig.heartbeatMd,
        skills: roleSkills,
        repoSkillsDir: join4(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join4(repoRoot, ".claude", "skills"),
        useSymlinks: true,
        mcpTools: msg.roleMcpTools,
        tmuxSession: `${this.machineId}-${this.companyId ? this.companyId.slice(0, 8) + "-" : ""}${role}`,
        machineId: this.machineId
      });
      if (role === "cpo") {
        await writeSubagentsConfig(workspaceDir);
      }
      const projects = await this.resolvePersistentProjects(msg, resolvedCompanyId);
      const reposDir = join4(workspaceDir, "repos");
      mkdirSync2(reposDir, { recursive: true });
      console.log(`[executor] Persistent agent repo symlink dir ready: ${reposDir}`);
      for (const project of projects) {
        try {
          if (!project.repo_url) {
            console.warn(`[executor] Persistent agent repo link skipped for project=${project.name}: missing repo_url`);
            continue;
          }
          await this.repoManager.ensureRepo(project.repo_url, project.name);
          const worktreeDir = await this.repoManager.ensureWorktree(project.name);
          const projectLinkPath = join4(reposDir, project.name);
          rmSync3(projectLinkPath, { force: true, recursive: true });
          symlinkSync2(worktreeDir, projectLinkPath);
          console.log(`[executor] Persistent agent repo symlinked: ${project.name} -> ${worktreeDir}`);
        } catch (err) {
          console.error(`[executor] Persistent agent repo link failed for project=${project.name}:`, err);
        }
      }
      generateExecSkill({
        name: role,
        prompt: claudeMdContent,
        heartbeat_md: roleConfig.heartbeatMd
      }, workspaceDir);
      publishSharedExecSkill({
        name: role,
        prompt: claudeMdContent,
        heartbeat_md: roleConfig.heartbeatMd
      }, workspaceDir, repoRoot);
      const rolePromptForHash = msg.rolePrompt ?? roleConfig.prompt;
      const promptHash = createHash("sha256").update(rolePromptForHash).digest("hex");
      writeFileSync2(join4(workspaceDir, ".role"), role);
      writeFileSync2(join4(workspaceDir, ".prompt-hash"), promptHash);
      if (resolvedCompanyId) {
        writeFileSync2(join4(workspaceDir, ".company-id"), resolvedCompanyId);
      }
      const freshnessScript = join4(repoRoot, "packages", "local-agent", "scripts", "check-prompt-freshness.sh");
      const settingsPath = join4(workspaceDir, ".claude", "settings.json");
      const existingSettings = JSON.parse(readFileSync3(settingsPath, "utf8"));
      const existingSessionStartHooks = Array.isArray(existingSettings.hooks?.SessionStart) ? existingSettings.hooks.SessionStart : [];
      const sessionStartHooks = [
        ...existingSessionStartHooks,
        { matcher: "", hooks: [{ type: "command", command: `bash ${freshnessScript}` }] }
      ];
      if (roleConfig.heartbeatMd.trim().length > 0) {
        sessionStartHooks.push({
          matcher: "",
          hooks: [{ type: "command", command: this.buildHeartbeatSessionStartCommand() }]
        });
      }
      existingSettings.hooks = {
        ...existingSettings.hooks,
        SessionStart: sessionStartHooks
      };
      writeFileSync2(settingsPath, JSON.stringify(existingSettings, null, 2));
      console.log(`[executor] Persistent agent workspace created at ${workspaceDir}`);
      if (resolvedCompanyId) {
        const machineUuid = await this.resolveMachineUuid(resolvedCompanyId);
        if (machineUuid) {
          this.supabase.from("persistent_agents").upsert({
            company_id: resolvedCompanyId,
            role,
            machine_id: machineUuid,
            status: "running",
            prompt_stack: msg.promptStackMinusSkills ?? "",
            last_heartbeat: (/* @__PURE__ */ new Date()).toISOString()
          }, { onConflict: "company_id,role,machine_id" }).then(({ error }) => {
            if (error)
              console.warn(`[executor] Failed to upsert persistent_agents for ${role}: ${error.message}`);
          });
        }
      }
    } catch (err) {
      console.error(`[executor] Persistent agent: failed to create workspace:`, err);
      await this.sendJobFailed(jobId, `Failed to create agent workspace: ${String(err)}`, "agent_crash");
      return;
    }
    const companyPrefix = this.companyId ? this.companyId.slice(0, 8) + "-" : "";
    const sessionName = `${this.machineId}-${companyPrefix}${role}`;
    try {
      await killTmuxSession(sessionName);
      const shellCmd = `unset CLAUDECODE; claude --model claude-opus-4-6`;
      const tmuxArgs = [
        "new-session",
        "-d",
        "-s",
        sessionName,
        "-c",
        workspaceDir,
        shellCmd
      ];
      await execFileAsync2("tmux", tmuxArgs);
      console.log(`[executor] Spawned persistent ${role} session: ${sessionName} (cwd=${workspaceDir})`);
    } catch (err) {
      console.error(`[executor] Persistent agent: failed to spawn tmux session:`, err);
      await this.sendJobFailed(jobId, `Failed to start agent session: ${String(err)}`, "agent_crash");
      return;
    }
    const startedAt = Date.now();
    const bootPrompt = roleConfig.bootPrompt ?? DEFAULT_BOOT_PROMPT;
    void this.enqueueMessage(bootPrompt, sessionName, startedAt).catch((err) => {
      console.error(`[executor] Failed to enqueue boot prompt for ${role}:`, err);
    });
    let initialOutputHash = "";
    try {
      const output = await capturePane(sessionName);
      initialOutputHash = createHash("sha256").update(output).digest("hex");
    } catch {
    }
    const persistentAgent = {
      role,
      tmuxSession: sessionName,
      jobId,
      companyId: resolvedCompanyId,
      heartbeatTimer: null,
      startedAt,
      lastActivityAt: startedAt,
      lastOutputHash: initialOutputHash,
      cacheTtlMinutes: roleConfig.cacheTtlMinutes,
      hardTtlMinutes: roleConfig.hardTtlMinutes,
      heartbeatTasksRun: roleConfig.heartbeatMd.trim().length > 0,
      consecutiveResetFailures: 0,
      lastResetAt: null,
      rolePromptSnapshot: roleConfig.prompt,
      originalJob: { ...msg, companyProjects: msg.companyProjects ? [...msg.companyProjects] : void 0 },
      resetInProgress: false
    };
    this.persistentAgents.set(role, persistentAgent);
    const uuid = this.machineUuid;
    persistentAgent.heartbeatTimer = setInterval(() => {
      void (async () => {
        if (persistentAgent.resetInProgress) {
          return;
        }
        try {
          const captureOutput = await capturePane(persistentAgent.tmuxSession);
          const outputHash = createHash("sha256").update(captureOutput).digest("hex");
          const changed = outputHash !== persistentAgent.lastOutputHash;
          if (changed) {
            persistentAgent.lastOutputHash = outputHash;
            persistentAgent.lastActivityAt = Date.now();
          }
          console.log(`[executor] Persistent heartbeat ${persistentAgent.role}: changed=${changed} idle=${Math.floor((Date.now() - persistentAgent.lastActivityAt) / 1e3)}s`);
        } catch (err) {
          console.warn(`[executor] Failed to capture pane for ${persistentAgent.role}: ${String(err)}`);
        }
        if (Date.now() - persistentAgent.startedAt >= MIN_SESSION_AGE_MS && persistentAgent.consecutiveResetFailures > 0) {
          persistentAgent.consecutiveResetFailures = 0;
          persistentAgent.lastResetAt = null;
        }
        await this.checkCacheTtl(persistentAgent);
        if (resolvedCompanyId && uuid) {
          this.supabase.from("persistent_agents").update({ last_heartbeat: (/* @__PURE__ */ new Date()).toISOString() }).eq("company_id", resolvedCompanyId).eq("machine_id", uuid).eq("status", "running").then(({ error }) => {
            if (error)
              console.warn(`[executor] Heartbeat update failed for persistent_agents: ${error.message}`);
          });
        }
      })().catch((err) => {
        console.error(`[executor] Persistent heartbeat crashed for ${persistentAgent.role}:`, err);
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.activeJobs.set(jobId, {
      jobId,
      slotType,
      slotAcquired: false,
      sessionName,
      pollTimer: null,
      timeoutTimer: null,
      settled: false,
      startedAt: Date.now(),
      logPath: "",
      lastBytesSent: 0,
      lastLifecycleBytesSent: 0,
      role: msg.role,
      attempt: 1,
      maxAttempts: 3,
      fixReasons: [],
      complexity: msg.complexity,
      model: msg.model
    });
    await this.sendJobStatus(jobId, "executing");
    console.log(`[executor] Persistent ${role} session=${sessionName} ready \u2014 jobId=${jobId}`);
  }
  // ---------------------------------------------------------------------------
  async checkCacheTtl(agent) {
    if (agent.resetInProgress)
      return;
    if (agent.cacheTtlMinutes <= 0 && agent.hardTtlMinutes <= 0)
      return;
    const now = Date.now();
    const idleMs = now - agent.lastActivityAt;
    const sessionAgeMs = now - agent.startedAt;
    if (sessionAgeMs < MIN_SESSION_AGE_MS) {
      return;
    }
    let humanAttached = false;
    try {
      const { stdout } = await execFileAsync2("tmux", ["list-clients", "-t", agent.tmuxSession]);
      humanAttached = stdout.trim().length > 0;
    } catch {
      humanAttached = false;
    }
    if (humanAttached) {
      agent.lastActivityAt = now;
    }
    const idleTtlExpired = agent.cacheTtlMinutes > 0 && idleMs > agent.cacheTtlMinutes * 6e4;
    const hardTtlExpired = agent.hardTtlMinutes > 0 && sessionAgeMs > agent.hardTtlMinutes * 6e4;
    if (!hardTtlExpired && (!idleTtlExpired || humanAttached)) {
      if (idleTtlExpired && humanAttached) {
        console.log(`[executor] Cache-TTL suppressed for ${agent.role}: human attached`);
      }
      return;
    }
    const reason = hardTtlExpired ? "hard-TTL" : "idle-TTL";
    console.log(`[executor] Cache-TTL reset triggered for ${agent.role}: ${reason} (idle=${Math.floor(idleMs / 1e3)}s, age=${Math.floor(sessionAgeMs / 1e3)}s)`);
    await this.resetPersistentSession(agent, reason);
  }
  async resetPersistentSession(agent, reason) {
    if (agent.resetInProgress) {
      return;
    }
    agent.resetInProgress = true;
    try {
      await execFileAsync2("tmux", ["send-keys", "-t", agent.tmuxSession, "exit", "Enter"]);
      await sleep(5e3);
      try {
        await execFileAsync2("tmux", ["has-session", "-t", agent.tmuxSession]);
        await execFileAsync2("tmux", ["send-keys", "-t", agent.tmuxSession, "C-c"]);
        await sleep(3e3);
        try {
          await execFileAsync2("tmux", ["kill-session", "-t", agent.tmuxSession]);
        } catch {
        }
      } catch {
      }
      const refreshedRoleConfig = await this.loadPersistentRoleConfig(agent.role);
      const activeJob = this.activeJobs.get(agent.jobId);
      if (activeJob) {
        activeJob.settled = true;
        this.clearJobTimers(activeJob);
        this.activeJobs.delete(agent.jobId);
      }
      const replayJob = {
        ...agent.originalJob,
        promptStackMinusSkills: this.refreshPersistentPromptStack(agent.originalJob.promptStackMinusSkills, agent.rolePromptSnapshot, refreshedRoleConfig.prompt),
        rolePrompt: refreshedRoleConfig.prompt
      };
      this.clearPersistentAgent(agent.role, { updateDbStatus: false });
      await this.handlePersistentJob(agent.jobId, replayJob, replayJob.slotType, agent.companyId);
      const restartedAgent = this.persistentAgents.get(agent.role);
      if (restartedAgent) {
        restartedAgent.consecutiveResetFailures = 0;
        restartedAgent.lastResetAt = Date.now();
      }
      console.log(`[executor] Cache-TTL reset complete for ${agent.role} (reason: ${reason})`);
    } catch (err) {
      agent.consecutiveResetFailures += 1;
      const now = Date.now();
      const lastResetAt = agent.lastResetAt;
      agent.lastResetAt = now;
      agent.resetInProgress = false;
      console.error(`[executor] Cache-TTL reset FAILED for ${agent.role} (attempt ${agent.consecutiveResetFailures}):`, err);
      if (agent.consecutiveResetFailures >= MAX_RESET_FAILURES && lastResetAt !== null && now - lastResetAt <= RESET_FAILURE_WINDOW_MS) {
        console.error(`[executor] CIRCUIT BREAKER: ${agent.role} reset loop detected \u2014 pausing auto-reset`);
        agent.cacheTtlMinutes = 0;
      }
    }
  }
  // ---------------------------------------------------------------------------
  async handleStopJob(msg) {
    const { jobId, reason } = msg;
    console.log(`[executor] handleStopJob \u2014 jobId=${jobId}, reason=${reason}`);
    try {
      await this._handleStopJobInner(msg);
    } catch (err) {
      jobLog(jobId, `FATAL handleStopJob crashed: ${String(err)}`);
      console.error(`[executor] FATAL handleStopJob crashed for jobId=${jobId}:`, err);
    }
  }
  async _handleStopJobInner(msg) {
    const { jobId, reason } = msg;
    const job = this.activeJobs.get(jobId);
    if (!job) {
      console.warn(`[executor] StopJob for unknown jobId=${jobId} \u2014 sending StopAck anyway`);
      await this.sendStopAck(jobId);
      return;
    }
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);
    const stoppedPersistentRole = [...this.persistentAgents.values()].find((a) => a.jobId === jobId)?.role;
    if (stoppedPersistentRole) {
      this.clearPersistentAgent(stoppedPersistentRole);
    }
    await killTmuxSession(job.sessionName);
    const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
    if (logChunk !== null) {
      const { error: appendErr } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "tmux",
        p_chunk: logChunk.chunk
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }
    const lifecycleLogPath1 = join4(JOB_LOG_DIR, `${jobId}-pre-post.log`);
    const lifecycleChunk1 = readLogFileFrom(lifecycleLogPath1, job.lastLifecycleBytesSent);
    if (lifecycleChunk1 !== null) {
      const { error } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "lifecycle",
        p_chunk: lifecycleChunk1.chunk
      });
      if (!error) {
        job.lastLifecycleBytesSent = lifecycleChunk1.newOffset;
      } else {
        console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
      }
    }
    if (job.worktreePath && job.jobBranch) {
      try {
        await this.repoManager.pushJobBranch(job.worktreePath, job.jobBranch);
      } catch (pushErr) {
        console.warn(`[executor] handleStopJob: push failed for jobId=${jobId} (best-effort): ${String(pushErr)}`);
      }
    }
    if (job.worktreePath && job.repoDir) {
      await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }
    if (!stoppedPersistentRole && job.slotAcquired) {
      this.slots.release(job.slotType);
    }
    await this.sendStopAck(jobId);
  }
  // ---------------------------------------------------------------------------
  // Private: Poll loop
  // ---------------------------------------------------------------------------
  async pollJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) {
      jobLog(jobId, `pollJob skipped \u2014 job=${job ? "exists" : "missing"}, settled=${job?.settled}`);
      return;
    }
    const alive = await isTmuxSessionAlive(job.sessionName);
    jobLog(jobId, `pollJob \u2014 session=${job.sessionName}, alive=${alive}`);
    if (alive) {
      try {
        const stat = statSync(job.logPath);
        const silenceMs = Date.now() - stat.mtimeMs;
        if (silenceMs > STUCK_NO_OUTPUT_MS) {
          const silenceMin = (silenceMs / 6e4).toFixed(1);
          jobLog(jobId, `Stuck detected - no pipe-pane output for ${silenceMin}m, killing session`);
          console.log(`[executor] Killing job ${jobId} - no pipe-pane output for ${silenceMin} minutes`);
          await killTmuxSession(job.sessionName);
          await this.sendJobFailed(jobId, `No pipe-pane output for ${silenceMin} minutes`, "stuck_no_output");
          await this.settleJob(jobId);
          return;
        }
      } catch (err) {
        jobLog(jobId, `Could not stat logPath for stuck detection: ${String(err)}`);
      }
      const elapsedMs = Date.now() - job.startedAt;
      const progress = Math.min(95, Math.floor(elapsedMs / JOB_TIMEOUT_MS * 100));
      const { error: progressErr } = await this.supabase.from("jobs").update({ progress, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", jobId);
      if (progressErr) {
        jobLog(jobId, `Progress write failed: ${progressErr.message}`);
        console.warn(`[executor] Progress write failed for jobId=${jobId}: ${progressErr.message}`);
      }
      const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
      if (logChunk !== null) {
        const { error: appendErr } = await this.supabase.rpc("append_job_log", {
          p_job_id: jobId,
          p_type: "tmux",
          p_chunk: logChunk.chunk
        });
        if (appendErr) {
          console.warn(`[executor] Log append failed for jobId=${jobId}: ${appendErr.message}`);
        } else {
          job.lastBytesSent = logChunk.newOffset;
        }
      }
      const lifecycleLogPath2 = join4(JOB_LOG_DIR, `${jobId}-pre-post.log`);
      const lifecycleChunk2 = readLogFileFrom(lifecycleLogPath2, job.lastLifecycleBytesSent);
      if (lifecycleChunk2 !== null) {
        const { error } = await this.supabase.rpc("append_job_log", {
          p_job_id: jobId,
          p_type: "lifecycle",
          p_chunk: lifecycleChunk2.chunk
        });
        if (!error) {
          job.lastLifecycleBytesSent = lifecycleChunk2.newOffset;
        } else {
          console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
        }
      }
      jobLog(jobId, `Still running \u2014 progress=${progress}`);
      console.log(`[executor] Job still running \u2014 jobId=${jobId}, session=${job.sessionName}, progress=${progress}`);
      return;
    }
    jobLog(jobId, `Tmux session ended \u2014 triggering onJobEnded`);
    console.log(`[executor] Tmux session ended \u2014 jobId=${jobId}, session=${job.sessionName}`);
    await this.onJobEnded(
      jobId,
      false
      /* not a forced timeout */
    );
  }
  // ---------------------------------------------------------------------------
  // Private: Timeout
  // ---------------------------------------------------------------------------
  async onJobTimeout(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled)
      return;
    jobLog(jobId, `TIMEOUT after ${JOB_TIMEOUT_MS / 6e4} min`);
    console.warn(`[executor] Job timed out after ${JOB_TIMEOUT_MS / 6e4} min \u2014 jobId=${jobId}`);
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);
    const timedOutPersistentRole = [...this.persistentAgents.values()].find((a) => a.jobId === jobId)?.role;
    if (timedOutPersistentRole) {
      this.clearPersistentAgent(timedOutPersistentRole);
    }
    await killTmuxSession(job.sessionName);
    const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
    if (logChunk !== null) {
      const { error: appendErr } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "tmux",
        p_chunk: logChunk.chunk
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }
    const lifecycleLogPath3 = join4(JOB_LOG_DIR, `${jobId}-pre-post.log`);
    const lifecycleChunk3 = readLogFileFrom(lifecycleLogPath3, job.lastLifecycleBytesSent);
    if (lifecycleChunk3 !== null) {
      const { error } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "lifecycle",
        p_chunk: lifecycleChunk3.chunk
      });
      if (!error) {
        job.lastLifecycleBytesSent = lifecycleChunk3.newOffset;
      } else {
        console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
      }
    }
    if (job.worktreePath && job.jobBranch) {
      try {
        await this.repoManager.pushJobBranch(job.worktreePath, job.jobBranch);
      } catch (pushErr) {
        console.warn(`[executor] onJobTimeout: push failed for jobId=${jobId} (best-effort): ${String(pushErr)}`);
      }
    }
    if (job.worktreePath && job.repoDir) {
      await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }
    if (!timedOutPersistentRole && job.slotAcquired) {
      this.slots.release(job.slotType);
    }
    await this.sendJobFailed(jobId, "Job exceeded 60-minute timeout", "timeout");
  }
  // ---------------------------------------------------------------------------
  // Private: Job ended (session exited naturally)
  // ---------------------------------------------------------------------------
  async onJobEnded(jobId, _timedOut) {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) {
      jobLog(jobId, `onJobEnded SKIPPED \u2014 job=${job ? "exists" : "missing"}, settled=${job?.settled}`);
      return;
    }
    jobLog(jobId, `onJobEnded START \u2014 role=${job.role ?? "none"}, worktree=${job.worktreePath ?? "none"}`);
    job.settled = true;
    this.clearJobTimers(job);
    if (job.slotType === "codex" && job.worktreePath) {
      let reviewResult;
      try {
        reviewResult = await runCodexReview(job, job.spec ?? "", job.acceptanceCriteria ?? "");
      } catch (reviewErr) {
        reviewResult = {
          pass: false,
          reason: `Codex review crashed: ${String(reviewErr)}`,
          committed: false
        };
      }
      jobLog(jobId, `Codex review: pass=${reviewResult.pass}, reason=${reviewResult.reason}`);
      console.log(`[executor] Codex review for jobId=${jobId}: pass=${reviewResult.pass}, reason=${reviewResult.reason}`);
      if (!reviewResult.pass) {
        job.fixReasons.push(reviewResult.reason);
        if (job.attempt < job.maxAttempts) {
          job.attempt += 1;
          console.log(`[codex] Review FAILED (attempt ${job.attempt - 1}/${job.maxAttempts}) \u2014 ${reviewResult.reason}`);
          console.log(`[codex] Retrying with fix prompt \u2014 attempt ${job.attempt}/${job.maxAttempts}, keeping existing changes in place`);
          jobLog(jobId, `Codex review failed \u2014 retrying attempt ${job.attempt}/${job.maxAttempts}. reason="${reviewResult.reason}"`);
          try {
            const fixPromptPath = buildFixPrompt(job);
            const built = buildCommand(job.slotType, job.complexity ?? "medium", job.model ?? "codex", job.worktreePath, fixPromptPath, job.repoDir);
            if (await isTmuxSessionAlive(job.sessionName)) {
              await killTmuxSession(job.sessionName);
            }
            await spawnTmuxSession(job.sessionName, built.cmd, built.args, job.worktreePath);
            try {
              await startPipePane(job.sessionName, job.logPath);
              jobLog(jobId, `pipe-pane restarted for retry attempt ${job.attempt}`);
            } catch (pipeErr) {
              jobLog(jobId, `pipe-pane restart FAILED (retry attempt ${job.attempt}): ${String(pipeErr)}`);
              console.warn(`[executor] pipe-pane restart failed for retry jobId=${jobId}: ${String(pipeErr)}`);
            }
            job.startedAt = Date.now();
            job.settled = false;
            job.timeoutTimer = setTimeout(() => {
              void this.onJobTimeout(jobId);
            }, JOB_TIMEOUT_MS);
            job.pollTimer = setInterval(() => {
              this.pollJob(jobId).catch((err) => {
                jobLog(jobId, `pollJob CRASHED: ${String(err)}`);
                console.error(`[executor] pollJob crashed for jobId=${jobId}:`, err);
              });
            }, POLL_INTERVAL_MS);
            jobLog(jobId, `Retry timers started (interval=${POLL_INTERVAL_MS}ms)`);
            return;
          } catch (retryErr) {
            jobLog(jobId, `Retry spawn FAILED on attempt ${job.attempt}: ${String(retryErr)}`);
          }
        }
        console.log(`[codex] All ${job.maxAttempts} attempts exhausted \u2014 reverting to starting commit`);
        console.log(`[codex] Failure reasons: ${job.fixReasons.map((r, i) => `[${i + 1}] ${r}`).join(" | ")}`);
        try {
          await execFileAsync2("git", ["reset", "--hard", job.startingCommit], { cwd: job.worktreePath });
          jobLog(jobId, `Reverted to startingCommit ${job.startingCommit} after ${job.attempt} failed attempts.`);
        } catch (revertErr) {
          jobLog(jobId, `Final revert failed (non-fatal): ${String(revertErr)}`);
        }
        this.activeJobs.delete(jobId);
        const exitedPersistentRole2 = [...this.persistentAgents.values()].find((a) => a.jobId === jobId)?.role;
        if (exitedPersistentRole2) {
          this.clearPersistentAgent(exitedPersistentRole2);
        } else if (job.slotAcquired) {
          this.slots.release(job.slotType);
        }
        const failLogChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
        if (failLogChunk !== null) {
          try {
            const { error: appendErr } = await this.supabase.rpc("append_job_log", {
              p_job_id: jobId,
              p_type: "tmux",
              p_chunk: failLogChunk.chunk
            });
            if (appendErr) {
              console.warn(`[executor] Final failure log flush failed for jobId=${jobId}: ${appendErr.message}`);
            }
          } catch (appendErr) {
            console.warn(`[executor] Final failure log flush crashed for jobId=${jobId}: ${String(appendErr)}`);
          }
        }
        const lifecycleLogPath4 = join4(JOB_LOG_DIR, `${jobId}-pre-post.log`);
        const lifecycleChunk4 = readLogFileFrom(lifecycleLogPath4, job.lastLifecycleBytesSent);
        if (lifecycleChunk4 !== null) {
          try {
            const { error } = await this.supabase.rpc("append_job_log", {
              p_job_id: jobId,
              p_type: "lifecycle",
              p_chunk: lifecycleChunk4.chunk
            });
            if (!error) {
              job.lastLifecycleBytesSent = lifecycleChunk4.newOffset;
            } else {
              console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
            }
          } catch (appendErr) {
            console.warn(`[executor] Lifecycle log flush crashed for jobId=${jobId}: ${String(appendErr)}`);
          }
        }
        await this.sendJobFailed(jobId, job.fixReasons.join(" | "), "unknown");
        return;
      }
      if (job.attempt > 1) {
        console.log(`[codex] Review PASSED (attempt ${job.attempt}/${job.maxAttempts}) \u2014 fixed after ${job.attempt - 1} retry`);
      }
    }
    this.activeJobs.delete(jobId);
    const exitedPersistentRole = [...this.persistentAgents.values()].find((a) => a.jobId === jobId)?.role;
    if (exitedPersistentRole) {
      this.clearPersistentAgent(exitedPersistentRole);
    } else if (job.slotAcquired) {
      this.slots.release(job.slotType);
    }
    const homeDir = process.env["HOME"] ?? "/tmp";
    const archiveDir = `${homeDir}/${REPORT_ARCHIVE_DIR}`;
    const jobReportPath = `${archiveDir}/${jobId}.md`;
    let result = "NO_REPORT";
    let report;
    mkdirSync2(archiveDir, { recursive: true });
    if (job.role === "reviewer") {
      if (!job.worktreePath) {
        result = "FAILED: Reviewer job missing required worktreePath";
        jobLog(jobId, "Report search ERROR \u2014 reviewer job missing required worktreePath");
      } else {
        const reviewerReportPath = `${job.worktreePath}/.claude/reviewer-report.md`;
        jobLog(jobId, `Report search \u2014 reviewer canonical path=${reviewerReportPath}`);
        try {
          renameSync(reviewerReportPath, jobReportPath);
          report = readFileSync3(jobReportPath, "utf-8");
          jobLog(jobId, `Report FOUND at ${reviewerReportPath} (${report.length} chars)`);
          console.log(`[executor] Claimed report for jobId=${jobId} from ${reviewerReportPath} \u2192 ${jobReportPath}`);
        } catch {
          jobLog(jobId, `Report not at ${reviewerReportPath}`);
        }
      }
    } else {
      const rpPath = reportRelativePath(job.role);
      const candidatePaths = [];
      if (job.worktreePath) {
        candidatePaths.push(`${job.worktreePath}/${rpPath}`);
      } else if (job.workspaceDir) {
        candidatePaths.push(`${job.workspaceDir}/${rpPath}`);
      }
      candidatePaths.push(`${homeDir}/${rpPath}`);
      const REPORT_FALLBACKS = {
        deployer: ".claude/deploy-report.md",
        "test-deployer": ".claude/deploy-report.md",
        tester: ".claude/tester-report.md",
        "job-merger": ".claude/job-merger-report.md"
      };
      const fallback = job.role ? REPORT_FALLBACKS[job.role] : void 0;
      if (fallback && fallback !== rpPath) {
        if (job.worktreePath)
          candidatePaths.push(`${job.worktreePath}/${fallback}`);
        else if (job.workspaceDir)
          candidatePaths.push(`${job.workspaceDir}/${fallback}`);
        candidatePaths.push(`${homeDir}/${fallback}`);
      }
      jobLog(jobId, `Report search \u2014 rpPath=${rpPath}, fallback=${fallback ?? "none"}, candidates=${JSON.stringify(candidatePaths)}`);
      for (const candidatePath of candidatePaths) {
        try {
          renameSync(candidatePath, jobReportPath);
          report = readFileSync3(jobReportPath, "utf-8");
          jobLog(jobId, `Report FOUND at ${candidatePath} (${report.length} chars)`);
          console.log(`[executor] Claimed report for jobId=${jobId} from ${candidatePath} \u2192 ${jobReportPath}`);
          break;
        } catch {
          jobLog(jobId, `Report not at ${candidatePath}`);
        }
      }
    }
    if (report) {
      const passMatch = report.match(/^status:\s*(pass|success|fail)\s*$/m);
      if (passMatch) {
        const prefix = passMatch[1] === "fail" ? "FAILED" : "PASSED";
        const reasonMatch = report.match(/^failure_reason:\s*(.+)$/m);
        result = reasonMatch?.[1]?.trim() ? `${prefix}: ${reasonMatch[1].trim()}` : prefix;
      } else {
        const passedAnywhere = report.match(/\*?\*?PASSED\*?\*?/);
        const failedAnywhere = report.match(/\*?\*?FAILED\*?\*?/);
        if (passedAnywhere && !failedAnywhere) {
          result = "PASSED";
        } else if (failedAnywhere) {
          result = "FAILED";
        } else {
          result = "VERDICT_MISSING";
        }
      }
      jobLog(jobId, `Report parsed \u2014 result="${result}"`);
    } else if (result === "NO_REPORT") {
      jobLog(jobId, `Report NOT FOUND \u2014 result="NO_REPORT"`);
      console.log(`[executor] No report file for jobId=${jobId}, result=NO_REPORT`);
    } else {
      jobLog(jobId, `Report retrieval failed \u2014 result="${result}"`);
      console.log(`[executor] Report retrieval failed for jobId=${jobId}, result=${result}`);
    }
    const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
    if (logChunk !== null) {
      const { error: appendErr } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "tmux",
        p_chunk: logChunk.chunk
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }
    const lifecycleLogPath5 = join4(JOB_LOG_DIR, `${jobId}-pre-post.log`);
    const lifecycleChunk5 = readLogFileFrom(lifecycleLogPath5, job.lastLifecycleBytesSent);
    if (lifecycleChunk5 !== null) {
      const { error } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "lifecycle",
        p_chunk: lifecycleChunk5.chunk
      });
      if (!error) {
        job.lastLifecycleBytesSent = lifecycleChunk5.newOffset;
      } else {
        console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
      }
    }
    let pr;
    if (job.worktreePath && job.jobBranch) {
      jobLog(jobId, `Pushing branch ${job.jobBranch} from ${job.worktreePath}`);
      try {
        await this.repoManager.pushJobBranch(job.worktreePath, job.jobBranch);
        jobLog(jobId, `Push succeeded for ${job.jobBranch}`);
        console.log(`[executor] Pushed branch ${job.jobBranch} for jobId=${jobId}`);
      } catch (pushErr) {
        jobLog(jobId, `Push FAILED for ${job.jobBranch}: ${String(pushErr)}`);
        console.warn(`[executor] onJobEnded: push failed for jobId=${jobId}: ${String(pushErr)}`);
      }
      try {
        await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
      } catch (worktreeErr) {
        jobLog(jobId, `Worktree cleanup failed (non-fatal): ${String(worktreeErr)}`);
        console.warn(`[executor] Worktree cleanup failed for jobId=${jobId}: ${String(worktreeErr)}`);
      }
      if (job.cardType === "combine" && job.repoUrl && job.featureBranch) {
        pr = await this.createPRForCombineJob(jobId, job);
      }
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }
    if (result === "PASSED" || result.startsWith("PASSED:")) {
      jobLog(jobId, `Sending JobComplete \u2014 result="${result}", hasReport=${!!report}`);
      try {
        await this.sendJobComplete(jobId, result, report, job.jobBranch, pr);
        jobLog(jobId, `JobComplete sent successfully`);
      } catch (sendErr) {
        jobLog(jobId, `sendJobComplete FAILED: ${String(sendErr)}`);
        console.error(`[executor] sendJobComplete failed for jobId=${jobId}:`, sendErr);
      }
    } else {
      jobLog(jobId, `Sending JobFailed \u2014 result="${result}"`);
      try {
        await this.sendJobFailed(jobId, result, "unknown");
        jobLog(jobId, `JobFailed sent successfully`);
      } catch (sendErr) {
        jobLog(jobId, `sendJobFailed FAILED: ${String(sendErr)}`);
        console.error(`[executor] sendJobFailed failed for jobId=${jobId}:`, sendErr);
      }
    }
    if (this.afterJobComplete) {
      try {
        await this.afterJobComplete(jobId);
      } catch (err) {
        console.error(`[executor] afterJobComplete failed for jobId=${jobId}:`, err);
      }
    }
  }
  // ---------------------------------------------------------------------------
  // Private: PR creation for combine jobs
  // ---------------------------------------------------------------------------
  async createPRForCombineJob(jobId, job) {
    const repoUrl = job.repoUrl;
    const featureBranch = job.featureBranch;
    const { data: jobRow } = await this.supabase.from("jobs").select("feature_id").eq("id", jobId).single();
    const featureId = jobRow?.feature_id;
    let featureTitle;
    if (featureId) {
      const { data: feature } = await this.supabase.from("features").select("title").eq("id", featureId).single();
      featureTitle = feature?.title ?? void 0;
    }
    const match = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) {
      jobLog(jobId, `PR skipped \u2014 cannot parse owner/repo from "${repoUrl}"`);
      return void 0;
    }
    const ownerRepo = match[1];
    const prTitle = `feat: ${featureTitle ?? featureId ?? jobId}`;
    const prBody = [
      "## Auto-generated PR",
      "",
      `Feature: ${featureTitle ?? "N/A"}`,
      `Feature ID: ${featureId ?? "N/A"}`,
      "",
      "This PR was automatically created by the zazig pipeline."
    ].join("\n");
    try {
      const { stdout } = await execFileAsync2("gh", [
        "pr",
        "create",
        "--repo",
        ownerRepo,
        "--base",
        "master",
        "--head",
        featureBranch,
        "--title",
        prTitle,
        "--body",
        prBody
      ], { encoding: "utf8" });
      const prUrl = stdout.trim();
      if (prUrl && featureId) {
        const { data: prWriteData, error: prWriteErr } = await this.supabase.from("features").update({ pr_url: prUrl }).eq("id", featureId).select("id");
        if (prWriteErr) {
          jobLog(jobId, `PR URL DB write FAILED for feature ${featureId}: ${prWriteErr.message}`);
          console.error(`[executor] PR URL DB write failed for feature ${featureId}:`, prWriteErr.message);
        } else if (!prWriteData?.length) {
          jobLog(jobId, `PR URL DB write matched 0 rows for feature ${featureId} \u2014 possible RLS block`);
          console.warn(`[executor] PR URL DB write matched 0 rows for feature ${featureId} \u2014 possible RLS block`);
        } else {
          jobLog(jobId, `PR URL persisted for feature ${featureId}: ${prUrl}`);
        }
      }
      jobLog(jobId, `PR created for feature ${featureId ?? "unknown"}: ${prUrl}`);
      console.log(`[executor] PR created for feature ${featureId ?? "unknown"}: ${prUrl}`);
      return prUrl || void 0;
    } catch (prErr) {
      jobLog(jobId, `PR creation failed: ${String(prErr)} \u2014 checking for existing PR`);
      console.warn(`[executor] PR creation failed for jobId=${jobId}: ${String(prErr)}`);
      try {
        const { stdout } = await execFileAsync2("gh", [
          "pr",
          "list",
          "--repo",
          ownerRepo,
          "--head",
          featureBranch,
          "--json",
          "url",
          "--limit",
          "1"
        ], { encoding: "utf8" });
        const prs = JSON.parse(stdout);
        if (prs.length > 0 && prs[0].url && featureId) {
          const { data: fallbackData } = await this.supabase.from("features").update({ pr_url: prs[0].url }).eq("id", featureId).select("id");
          if (!fallbackData?.length) {
            jobLog(jobId, `PR URL fallback write matched 0 rows for feature ${featureId} \u2014 possible RLS block`);
          } else {
            jobLog(jobId, `Found existing PR for feature ${featureId}: ${prs[0].url}`);
          }
          console.log(`[executor] Found existing PR for feature ${featureId}: ${prs[0].url}`);
          return prs[0].url;
        }
      } catch {
      }
      return void 0;
    }
  }
  // ---------------------------------------------------------------------------
  // Private: Message injection queue (ported from SlackChatRouter)
  // ---------------------------------------------------------------------------
  enqueueMessage(message, sessionName, startedAt, type = "human") {
    return new Promise((resolve4, reject) => {
      enqueueWithCap(this.messageQueue, { text: message, sessionName, startedAt, type, resolve: resolve4, reject }, MAX_QUEUE_SIZE);
      if (!this.processingQueue) {
        void this.processMessageQueue();
      }
    });
  }
  async processMessageQueue() {
    this.processingQueue = true;
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      try {
        await this.injectMessage(item.text, item.sessionName, item.startedAt);
        item.resolve();
      } catch (err) {
        console.error("[executor] Failed to inject message:", err);
        item.reject(err);
      }
    }
    this.processingQueue = false;
  }
  /**
   * Injects a message into a persistent agent's tmux session immediately.
   * Claude Code's interactive TUI auto-queues input — no idle detection needed.
   * If the session just started, waits for CPO_STARTUP_DELAY_MS to let Claude Code initialize.
   */
  async injectMessage(message, sessionName, startedAt) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < CPO_STARTUP_DELAY_MS) {
      const wait = CPO_STARTUP_DELAY_MS - elapsed;
      console.log(`[executor] Session ${sessionName} is ${Math.round(elapsed / 1e3)}s old \u2014 waiting ${Math.round(wait / 1e3)}s for startup`);
      await sleep(wait);
    }
    const singleLine = message.replace(/\r?\n/g, " ");
    await execFileAsync2("tmux", ["send-keys", "-t", sessionName, "-l", singleLine]);
    await execFileAsync2("tmux", ["send-keys", "-t", sessionName, "Enter"]);
    console.log(`[executor] Injected message into session=${sessionName}`);
  }
  // ---------------------------------------------------------------------------
  // Private: Persistent agent cleanup
  // ---------------------------------------------------------------------------
  /**
   * Marks a persistent agent as stopped in the DB, clears its heartbeat timer,
   * and removes it from the persistentAgents map.
   *
   * @param role - The role key to look up in persistentAgents. If omitted, clears ALL agents.
   */
  clearPersistentAgent(role, options) {
    const agentsToClear = role ? this.persistentAgents.has(role) ? [this.persistentAgents.get(role)] : [] : [...this.persistentAgents.values()];
    const updateDbStatus = options?.updateDbStatus ?? true;
    for (const agent of agentsToClear) {
      if (agent.heartbeatTimer) {
        clearInterval(agent.heartbeatTimer);
        agent.heartbeatTimer = null;
      }
      if (updateDbStatus && agent.companyId && this.machineUuid) {
        this.supabase.from("persistent_agents").update({ status: "stopped" }).eq("company_id", agent.companyId).eq("role", agent.role).eq("machine_id", this.machineUuid).then(({ error }) => {
          if (error)
            console.warn(`[executor] Failed to update persistent_agents status for role=${agent.role}: ${error.message}`);
        });
      }
      this.persistentAgents.delete(agent.role);
    }
  }
  // ---------------------------------------------------------------------------
  // Private: Timer management
  // ---------------------------------------------------------------------------
  clearJobTimers(job) {
    if (job.pollTimer !== null) {
      clearInterval(job.pollTimer);
      job.pollTimer = null;
    }
    if (job.timeoutTimer !== null) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = null;
    }
  }
  async settleJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job)
      return;
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);
    const persistentRole = [...this.persistentAgents.values()].find((agent) => agent.jobId === jobId)?.role;
    if (persistentRole) {
      this.clearPersistentAgent(persistentRole);
    } else if (job.slotAcquired) {
      this.slots.release(job.slotType);
    }
    if (job.worktreePath && job.repoDir) {
      try {
        await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
      } catch (err) {
        console.warn(`[executor] Failed to clean worktree for jobId=${jobId}: ${String(err)}`);
      }
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }
  }
  // ---------------------------------------------------------------------------
  // Private: Context resolution
  // ---------------------------------------------------------------------------
  async resolveContext(context, contextRef) {
    if (contextRef) {
      console.log(`[executor] Fetching context from contextRef: ${contextRef}`);
      const response = await fetch(contextRef);
      if (!response.ok) {
        throw new Error(`Failed to fetch contextRef (HTTP ${response.status}): ${contextRef}`);
      }
      return await response.text();
    }
    if (context) {
      return context;
    }
    throw new Error("StartJob has neither context nor contextRef");
  }
  // ---------------------------------------------------------------------------
  // Private: Message senders
  // ---------------------------------------------------------------------------
  async sendJobAck(jobId) {
    await this.send({
      type: "job_ack",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId
    });
  }
  async sendJobStatus(jobId, status, output) {
    if (!jobId.startsWith("persistent-")) {
      const { error: dbErr } = await this.supabase.from("jobs").update({ status }).eq("id", jobId);
      if (dbErr) {
        console.warn(`[executor] sendJobStatus DB write failed for jobId=${jobId}: ${dbErr.message}`);
      }
    }
    await this.send({
      type: "job_status",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      status,
      ...output !== void 0 ? { output } : {}
    });
  }
  async sendJobComplete(jobId, result, report, branch, pr) {
    await this.send({
      type: "job_complete",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
      result,
      branch: branch ?? void 0,
      pr_url: pr ?? void 0,
      ...pr !== void 0 ? { pr } : {},
      ...report !== void 0 ? { report } : {}
    });
  }
  async sendJobFailed(jobId, result, failureReason) {
    jobLog(jobId, `FAILED \u2014 reason=${failureReason}, error="${result.slice(0, 200)}"`);
    await this.send({
      type: "job_failed",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
      error: result,
      failureReason
    });
  }
  async sendStopAck(jobId) {
    await this.send({
      type: "stop_ack",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId
    });
  }
};
async function runCodexReview(job, jobSpec, acceptanceCriteria) {
  const worktreePath = job.worktreePath;
  const overlayPaths = [
    "CLAUDE.md",
    ".mcp.json",
    ".claude/",
    ".gitignore",
    ".zazig-prompt.txt",
    ".zazig-review-prompt.txt",
    ".zazig-fix-prompt-*.txt",
    ".zazig-fix-prompt-1.txt",
    ".zazig-fix-prompt-2.txt",
    ".zazig-fix-prompt-3.txt"
  ];
  let startingCommit;
  if (job.startingCommit) {
    startingCommit = job.startingCommit;
  } else {
    try {
      const { stdout } = await execFileAsync2("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
      startingCommit = stdout.trim();
    } catch (err) {
      return { pass: false, reason: `git rev-parse failed: ${String(err)}`, committed: false };
    }
  }
  let committed = false;
  try {
    await execFileAsync2("git", ["add", "--all"], { cwd: worktreePath });
    await execFileAsync2("git", [
      "reset",
      "HEAD",
      "--",
      ...overlayPaths
    ], { cwd: worktreePath }).catch(() => {
    });
    await execFileAsync2("git", ["commit", "-m", `codex: ${job.jobId}`], { cwd: worktreePath });
    committed = true;
  } catch {
  }
  let currentCommit;
  try {
    const { stdout } = await execFileAsync2("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
    currentCommit = stdout.trim();
  } catch (err) {
    return { pass: false, reason: `git rev-parse failed: ${String(err)}`, committed, startingCommit };
  }
  const codexSelfCommitted = !committed && currentCommit !== startingCommit;
  if (!committed && !codexSelfCommitted) {
    let uncommittedDiff = "";
    try {
      const { stdout } = await execFileAsync2("git", [
        "diff",
        "HEAD",
        "--",
        ".",
        ...overlayPaths.map((path) => `:!${path}`)
      ], { cwd: worktreePath });
      uncommittedDiff = stdout;
    } catch (err) {
      return { pass: false, reason: `git diff failed: ${String(err)}`, committed: false };
    }
    if (!uncommittedDiff.trim()) {
      const rpPath = join4(worktreePath, reportRelativePath(job.role));
      try {
        const report = readFileSync3(rpPath, "utf-8");
        const statusMatch = report.match(/^status:\s*(pass|success)\s*$/m);
        if (statusMatch) {
          jobLog(job.jobId, `No code diff but report confirms spec already met \u2014 passing`);
          return { pass: true, reason: "No changes needed \u2014 report confirms spec already met", committed: false, startingCommit };
        }
      } catch {
      }
      return { pass: false, reason: "Codex produced no changes", committed: false, startingCommit };
    }
    return { pass: false, reason: "Codex changes could not be committed", committed: false, startingCommit };
  }
  let diff;
  try {
    const { stdout } = await execFileAsync2("git", ["diff", `${startingCommit}..HEAD`], { cwd: worktreePath });
    diff = stdout;
  } catch (err) {
    return {
      pass: false,
      reason: `git diff failed: ${String(err)}`,
      committed,
      codexSelfCommitted,
      startingCommit
    };
  }
  if (!diff.trim()) {
    return { pass: false, reason: "Codex produced no changes", committed, codexSelfCommitted, startingCommit };
  }
  const reviewPrompt = [
    "You are reviewing a code diff produced by an automated coding agent.",
    "## Original Spec",
    jobSpec,
    "## Acceptance Criteria",
    acceptanceCriteria,
    "## Diff",
    diff,
    "## Review Rules",
    "1. Review against spec and acceptance criteria \u2014 not diff size or file count.",
    "2. Do NOT fail because files mentioned in the spec are absent from the diff. Those files may already have been correct before the job started and needed no changes.",
    "3. Do NOT fail because the agent added reasonable supplementary changes (e.g. extra CSS classes, minor refactors) beyond what the spec literally states, as long as the spec requirements are MET.",
    "4. Adjacent files (tests, types, helpers) are acceptable if they support the spec.",
    "PASS if: the diff addresses the spec requirements and acceptance criteria are met. Minor additions beyond spec are acceptable.",
    "FAIL only if: the diff introduces obvious bugs, contains placeholder code, or clearly contradicts a stated requirement.",
    "Respond with exactly: PASS or FAIL: reason"
  ].join("\n");
  const reviewPromptPath = join4(worktreePath, ".zazig-review-prompt.txt");
  writeFileSync2(reviewPromptPath, reviewPrompt, "utf-8");
  let reviewOutput;
  try {
    const shellCmd = `cat ${shellEscape([reviewPromptPath])} | claude --model claude-haiku-4-5-20251001 -p`;
    const { stdout } = await execFileAsync2("bash", ["-c", shellCmd], {
      cwd: worktreePath,
      maxBuffer: 1024 * 1024
    });
    reviewOutput = stdout.trim();
  } catch (err) {
    return { pass: false, reason: `Haiku review failed: ${String(err)}`, committed, codexSelfCommitted, startingCommit };
  }
  if (reviewOutput.startsWith("PASS")) {
    return { pass: true, reason: "PASS", committed, codexSelfCommitted, startingCommit };
  }
  const failMatch = reviewOutput.match(/^FAIL:\s*(.+)/s);
  return {
    pass: false,
    reason: failMatch ? failMatch[1].trim() : reviewOutput || "Haiku returned no output",
    committed,
    codexSelfCommitted,
    startingCommit
  };
}
function assembleContext(msg, repoRoot) {
  let assembled = msg.promptStackMinusSkills ?? msg.context ?? "";
  assembled = assembled.replace(`

---

${SKILLS_MARKER}

---

`, "\n\n---\n\n");
  assembled = assembled.replace(SKILLS_MARKER, "");
  if (msg.subAgentPrompt) {
    const workspaceDir = join4(homedir2(), ".zazigv2", `job-${msg.jobId}`);
    mkdirSync2(workspaceDir, { recursive: true, mode: 448 });
    const personalityFile = join4(workspaceDir, "subagent-personality.md");
    writeFileSync2(personalityFile, msg.subAgentPrompt, { encoding: "utf8", mode: 384 });
    assembled += `

---

# Sub-Agent Instructions
When spawning sub-agents, begin their prompt with the content of:
${personalityFile}`;
  }
  return assembled;
}
function buildFixPrompt(job) {
  if (!job.worktreePath) {
    throw new Error("buildFixPrompt requires a worktreePath");
  }
  let originalSpec = job.spec;
  try {
    originalSpec = readFileSync3(join4(job.worktreePath, ".zazig-prompt.txt"), "utf-8");
  } catch {
  }
  const reasons = job.fixReasons.length > 0 ? job.fixReasons.map((reason, idx) => `${idx + 1}. ${reason}`).join("\n") : "1. No review reason recorded.";
  const fixPrompt = [
    `Codex review failed for job ${job.jobId}.`,
    `Attempt ${job.attempt} of ${job.maxAttempts}.`,
    "",
    "## Original Spec",
    originalSpec?.trim().length ? originalSpec : "No spec provided.",
    "",
    "## Acceptance Criteria",
    job.acceptanceCriteria?.trim().length ? job.acceptanceCriteria : "No acceptance criteria provided.",
    "",
    "## Review Failure Reasons",
    reasons,
    "",
    "Update the implementation to fix every failure reason while staying within the original scope.",
    "Do not leave placeholder code."
  ].join("\n");
  const fixPromptPath = join4(job.worktreePath, `.zazig-fix-prompt-${job.attempt}.txt`);
  writeFileSync2(fixPromptPath, fixPrompt, "utf-8");
  return fixPromptPath;
}
function buildCommand(slotType, complexity, model, worktreePath, promptFilePath, repoDir) {
  const resolvedModel = model && model !== "codex" ? model : slotType === "codex" ? "gpt-5.3-codex" : complexity === "complex" ? "claude-opus-4-6" : "claude-sonnet-4-6";
  if (slotType === "codex") {
    const args = ["exec", "-m", resolvedModel, "--full-auto", "-C", worktreePath ?? process.cwd(), "--skip-git-repo-check"];
    if (repoDir) {
      args.push("--add-dir", repoDir);
    }
    if (complexity === "medium") {
      args.push("-c", "model_reasoning_effort=xhigh");
    }
    args.push(promptFilePath ?? "");
    return {
      cmd: "codex",
      args
    };
  }
  return {
    cmd: "claude",
    args: ["--model", resolvedModel, "-p", "--verbose", "--output-format", "stream-json"]
  };
}
async function spawnTmuxSession(sessionName, cmd, args, cwd, promptFile) {
  const claudeCmd = shellEscape([cmd, ...args]);
  const shellCmd = promptFile ? `unset CLAUDECODE; cat ${shellEscape([promptFile])} | ${claudeCmd} 2>&1` : `unset CLAUDECODE; ${claudeCmd} 2>&1`;
  const tmuxArgs = [
    "new-session",
    "-d",
    // detached
    "-s",
    sessionName,
    ...cwd ? ["-c", cwd] : [],
    shellCmd
    // the command the session runs
  ];
  await execFileAsync2("tmux", tmuxArgs);
}
async function killTmuxSession(sessionName) {
  try {
    await execFileAsync2("tmux", ["kill-session", "-t", sessionName]);
    console.log(`[executor] Killed tmux session: ${sessionName}`);
  } catch (err) {
    console.warn(`[executor] Could not kill tmux session ${sessionName}:`, err);
  }
}
async function capturePane(sessionName) {
  const { stdout } = await execFileAsync2("tmux", ["capture-pane", "-t", sessionName, "-p"]);
  return stdout;
}
async function isTmuxSessionAlive(sessionName) {
  try {
    await execFileAsync2("tmux", ["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}
function sleep(ms) {
  return new Promise((resolve4) => setTimeout(resolve4, ms));
}
function jobLogPath(jobId) {
  return `${JOB_LOG_DIR}/${jobId}-pipe-pane.log`;
}
async function startPipePane(sessionName, logPath2) {
  await execFileAsync2("tmux", [
    "pipe-pane",
    "-t",
    sessionName,
    `cat >> '${logPath2}'`
  ]);
}
function readLogFileFrom(logPath2, offsetBytes) {
  try {
    const buf = readFileSync3(logPath2);
    if (buf.length <= offsetBytes)
      return null;
    const raw = buf.subarray(offsetBytes).toString("utf8");
    const clean = raw.replace(/\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07]*\x07|[()#][A-Za-z0-9]|.)/g, "");
    if (!clean)
      return null;
    return { chunk: clean, newOffset: buf.length };
  } catch {
    return null;
  }
}
function cleanupJobWorkspace(jobId, workspaceDir) {
  try {
    const target = workspaceDir && workspaceDir.trim().length > 0 ? workspaceDir : join4(homedir2(), ".zazigv2", `job-${jobId}`);
    rmSync3(target, { recursive: true });
  } catch {
  }
}
function shellEscape(parts) {
  return parts.map((p) => `'${p.replace(/'/g, `'"'"'`)}'`).join(" ");
}

// ../local-agent/dist/job-recovery.js
async function recoverDispatchedJobs(dbClient, machineName, options) {
  const gracePeriodMs = options?.gracePeriodMs ?? 5 * 60 * 1e3;
  try {
    let machineQuery = dbClient.from("machines").select("id").eq("name", machineName);
    if (options?.companyIds && options.companyIds.length > 0) {
      machineQuery = machineQuery.in("company_id", options.companyIds);
    }
    const { data: machines, error: machErr } = await machineQuery;
    if (machErr || !machines || machines.length === 0) {
      return 0;
    }
    const machineIds = machines.map((m) => m.id);
    let jobQuery = dbClient.from("jobs").select("id, status, job_type, role").in("machine_id", machineIds).eq("status", "dispatched");
    if (gracePeriodMs > 0) {
      const graceCutoff = new Date(Date.now() - gracePeriodMs).toISOString();
      jobQuery = jobQuery.lt("updated_at", graceCutoff);
    }
    const { data: stuckJobs, error: jobErr } = await jobQuery;
    if (jobErr) {
      console.error("[local-agent] Error querying dispatched jobs:", jobErr.message);
      return 0;
    }
    if (!stuckJobs || stuckJobs.length === 0) {
      return 0;
    }
    console.log(`[local-agent] Found ${stuckJobs.length} dispatched job(s) \u2014 resetting to queued`);
    let recovered = 0;
    for (const job of stuckJobs) {
      const { error: updateErr } = await dbClient.from("jobs").update({
        status: "queued",
        machine_id: null,
        started_at: null
      }).eq("id", job.id).eq("status", "dispatched");
      if (updateErr) {
        console.error(`[local-agent] Failed to reset job ${job.id}: ${updateErr.message}`);
      } else {
        console.log(`[local-agent] Reset job ${job.id} (dispatched \u2192 queued, role=${job.role ?? "none"})`);
        recovered++;
      }
    }
    return recovered;
  } catch (err) {
    console.error("[local-agent] Job recovery failed:", err);
    return 0;
  }
}

// ../local-agent/dist/connection.js
var CREDENTIALS_PATH = join5(homedir3(), ".zazigv2", "credentials.json");
var execFileAsync3 = promisify3(execFile3);
var BACKOFF_BASE_MS = 1e3;
var BACKOFF_MAX_MS = 3e4;
var BACKOFF_MULTIPLIER = 2;
var sleep2 = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
var AgentConnection = class {
  /** Anon-key client — used for Realtime subscriptions only. */
  supabase;
  /** Service-role client for direct DB writes (bypasses RLS). Falls back to anon client if service_role_key not set. */
  dbClient;
  machineName;
  primaryCompanyId;
  agentVersion;
  companyIds = [];
  config;
  slots;
  handlers = [];
  /** Inbound channel: `agent:{machineId}:{companyId}` — receives commands from orchestrator. */
  channel = null;
  heartbeatTimer = null;
  reconnectTimer = null;
  reconnectAttempts = 0;
  stopped = false;
  isRecoveryRunning = false;
  consecutiveHeartbeatFailures = 0;
  lastHeartbeatSentAt = Date.now();
  killStaleJobsFn;
  outdated = false;
  outdatedWarningTimer = null;
  outdatedExitPollTimer = null;
  constructor(config, slots, agentVersion) {
    this.config = config;
    this.machineName = config.name;
    this.primaryCompanyId = config.company_id;
    this.agentVersion = agentVersion;
    this.slots = slots;
    if (config.supabase.access_token && !config.supabase.refresh_token) {
      throw new Error("[local-agent] refresh_token is required when access_token is set \u2014 daemon refused to start");
    }
    this.supabase = createClient(config.supabase.url, config.supabase.anon_key, {
      realtime: {
        // Node.js requires an explicit WebSocket implementation; the ws package
        // types don't perfectly align with supabase-js's WebSocketLikeConstructor.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transport: wrapper_default,
        params: {
          eventsPerSecond: 10
        }
      }
    });
    if (config.supabase.access_token && config.supabase.refresh_token) {
      this.dbClient = createClient(config.supabase.url, config.supabase.anon_key);
      console.log("[local-agent] Using authenticated JWT with auto-refresh for DB writes");
    } else if (config.supabase.service_role_key) {
      this.dbClient = createClient(config.supabase.url, config.supabase.service_role_key);
      console.log("[local-agent] Using service_role key for DB writes");
    } else {
      this.dbClient = this.supabase;
      console.warn("[local-agent] No access token or service_role key set \u2014 DB writes will use anon key (may fail)");
    }
  }
  /** Register a handler for incoming OrchestratorMessages. */
  onMessage(handler) {
    this.handlers.push(handler);
  }
  setKillStaleJobsFn(fn) {
    this.killStaleJobsFn = fn;
  }
  /**
   * Send an AgentMessage to the orchestrator via the `agent-event` edge function.
   */
  async sendMessage(msg) {
    if (this.stopped) {
      console.warn("[local-agent] sendMessage called while stopped; message dropped:", msg.type);
      return;
    }
    await this.sendToOrchestrator(msg);
  }
  async sendToOrchestrator(msg) {
    const url = `${this.config.supabase.url}/functions/v1/agent-event`;
    const { data: { session } } = await this.dbClient.auth.getSession();
    const token = session?.access_token ?? this.config.supabase.anon_key;
    for (const delay of [0, 1e3, 5e3, 15e3]) {
      if (delay > 0)
        await sleep2(delay);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(msg)
        });
        if (res.ok)
          return true;
        console.warn(`[local-agent] agent-event failed (${res.status}), retrying...`);
      } catch (e) {
        console.warn(`[local-agent] agent-event error: ${e}, retrying...`);
      }
    }
    console.error("[local-agent] agent-event failed after 3 retries");
    return false;
  }
  /**
   * Query user_companies to get all companies the authenticated user belongs to.
   * Falls back to config.company_id if the query fails or returns nothing.
   *
   * IMPORTANT: Only queries when using an authenticated JWT (RLS filters by user).
   * With service_role key, RLS is bypassed and the query would return ALL companies
   * for ALL users — causing this machine to register under other users' companies.
   */
  async getCompanyIds() {
    if (!this.config.supabase.access_token) {
      console.warn("[local-agent] No access token \u2014 skipping user_companies query (service_role would bypass RLS)");
      return [];
    }
    try {
      const { data } = await this.dbClient.from("user_companies").select("company_id");
      return (data ?? []).map((r) => r.company_id);
    } catch (err) {
      console.warn(`[local-agent] Failed to query user_companies: ${String(err)}`);
      return [];
    }
  }
  /** Connect to Supabase Realtime and start the heartbeat loop. */
  async start() {
    console.log(`[local-agent] Starting daemon for machine: ${this.machineName}`);
    this.stopped = false;
    if (this.config.supabase.access_token && this.config.supabase.refresh_token) {
      const { error } = await this.dbClient.auth.setSession({
        access_token: this.config.supabase.access_token,
        refresh_token: this.config.supabase.refresh_token
      });
      if (error) {
        throw new Error(`[local-agent] Failed to set auth session: ${error.message}`);
      } else {
        console.log("[local-agent] Auth session initialized \u2014 auto-refresh enabled");
      }
      this.dbClient.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token && session?.refresh_token) {
          try {
            let existing = {};
            try {
              existing = JSON.parse(readFileSync4(CREDENTIALS_PATH, "utf-8"));
            } catch {
            }
            const creds = {
              ...existing,
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
              email: session.user?.email ?? existing.email,
              supabaseUrl: this.config.supabase.url
            };
            mkdirSync3(join5(homedir3(), ".zazigv2"), { recursive: true });
            writeFileSync3(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + "\n", { mode: 384 });
            console.log(`[local-agent] Credentials refreshed and saved to disk`);
          } catch (err) {
            console.warn(`[local-agent] Failed to save refreshed credentials: ${String(err)}`);
          }
        }
      });
    }
    const discovered = await this.getCompanyIds();
    if (discovered.length > 0) {
      this.companyIds = discovered;
      console.log(`[local-agent] User belongs to ${discovered.length} company(ies): ${discovered.join(", ")}`);
    } else if (this.primaryCompanyId) {
      this.companyIds = [this.primaryCompanyId];
      console.warn("[local-agent] Could not discover companies from user_companies \u2014 falling back to config.company_id");
    } else {
      console.warn("[local-agent] No companies found and no company_id in config \u2014 heartbeats may fail");
      this.companyIds = [];
    }
    if (!this.config.supabase.access_token && !this.config.supabase.service_role_key) {
      console.warn("[local-agent] No access token set \u2014 multi-company lookup requires an authenticated JWT");
    }
    await this.registerMachine();
    await this.connect();
  }
  /** Gracefully disconnect and stop all timers. */
  async stop() {
    this.stopped = true;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.clearOutdatedWarningTimer();
    this.clearOutdatedExitPollTimer();
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    console.log(`[local-agent] Daemon stopped.`);
  }
  // ---------------------------------------------------------------------------
  // Private connection management
  // ---------------------------------------------------------------------------
  async connect() {
    if (this.stopped)
      return;
    if (!this.primaryCompanyId) {
      throw new Error("Cannot connect without company_id \u2014 set ZAZIG_COMPANY_ID");
    }
    const channelName = `agent:${this.machineName}:${this.primaryCompanyId}`;
    console.log(`[local-agent] Connecting to inbound channel: ${channelName}`);
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false }
      }
    });
    this.channel.on("broadcast", { event: "*" }, (payload) => {
      console.log(`[local-agent][DEBUG] Broadcast received \u2014 event=${payload.event ?? "unknown"}, keys=${Object.keys(payload)}`);
    });
    this.channel.on("broadcast", { event: "message" }, (payload) => {
      try {
        console.log(`[local-agent][DEBUG] Matched event=message`);
        this.handleIncomingPayload(payload.payload);
      } catch (err) {
        console.error(`[local-agent] Broadcast handler crashed (event=message):`, err);
      }
    });
    this.channel.on("broadcast", { event: "start_job" }, (payload) => {
      try {
        console.log(`[local-agent][DEBUG] Matched event=start_job`);
        this.handleIncomingPayload(payload.payload);
      } catch (err) {
        console.error(`[local-agent] Broadcast handler crashed (event=start_job):`, err);
      }
    });
    this.channel.on("broadcast", { event: "job_unblocked" }, (payload) => {
      try {
        console.log(`[local-agent][DEBUG] Matched event=job_unblocked`);
        this.handleIncomingPayload(payload.payload);
      } catch (err) {
        console.error(`[local-agent] Broadcast handler crashed (event=job_unblocked):`, err);
      }
    });
    this.channel.on("broadcast", { event: "start_expert" }, (payload) => {
      try {
        console.log(`[local-agent][DEBUG] Matched event=start_expert`);
        this.handleIncomingPayload(payload.payload);
      } catch (err) {
        console.error(`[local-agent] Broadcast handler crashed (event=start_expert):`, err);
      }
    });
    this.channel.on("broadcast", { event: "message_inbound" }, (payload) => {
      try {
        console.log(`[local-agent][DEBUG] Matched event=message_inbound`);
        this.handleIncomingPayload(payload.payload);
      } catch (err) {
        console.error(`[local-agent] Broadcast handler crashed (event=message_inbound):`, err);
      }
    });
    let inReady = false;
    const onBothReady = () => {
      if (inReady) {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      }
    };
    this.channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[local-agent] Connected to inbound channel: ${channelName}`);
        inReady = true;
        onBothReady();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[local-agent] Inbound channel error (status=${status}):`, err ?? "unknown error");
        this.clearHeartbeatTimer();
        this.scheduleReconnect();
      } else if (status === "CLOSED") {
        if (!this.stopped) {
          console.warn(`[local-agent] Inbound channel closed unexpectedly. Scheduling reconnect.`);
          this.clearHeartbeatTimer();
          this.scheduleReconnect();
        }
      }
    });
  }
  handleIncomingPayload(payload) {
    if (!isOrchestratorMessage(payload)) {
      const obj = typeof payload === "object" && payload !== null ? payload : {};
      const jobId = typeof obj.jobId === "string" ? obj.jobId : void 0;
      const msgType = typeof obj.type === "string" ? obj.type : "unknown";
      const cardType = typeof obj.cardType === "string" ? obj.cardType : void 0;
      console.warn(`[local-agent] Rejected invalid message: type=${msgType}, jobId=${jobId ?? "none"}, cardType=${cardType ?? "none"}. Full payload: ${JSON.stringify(payload)}`);
      if (jobId) {
        try {
          const logDir = join5(homedir3(), ".zazigv2", "job-logs");
          mkdirSync3(logDir, { recursive: true });
          appendFileSync3(join5(logDir, `${jobId}-pre-post.log`), `${(/* @__PURE__ */ new Date()).toISOString()} REJECTED by validator: type=${msgType}, cardType=${cardType ?? "none"}
`);
        } catch {
        }
      }
      return;
    }
    if (this.outdated && (payload.type === "start_job" || payload.type === "start_expert")) {
      console.warn(`[local-agent] Ignoring ${payload.type} while agent is outdated and awaiting upgrade`);
      return;
    }
    console.log(`[local-agent] Received message: type=${payload.type}`, JSON.stringify(payload));
    if ("jobId" in payload && typeof payload.jobId === "string") {
      const msg = payload;
      jobLog(payload.jobId, `RECV from orchestrator: type=${payload.type}, slotType=${msg.slotType ?? "none"}, role=${msg.role ?? "none"}, cardType=${msg.cardType ?? "none"}`);
    }
    for (const handler of this.handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error("[local-agent] Message handler threw:", err);
      }
    }
  }
  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------
  startHeartbeat() {
    this.clearHeartbeatTimer();
    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const inState = this.channel?.state ?? "null";
      console.log(`[local-agent][DEBUG] Channel state: inbound=${inState}, machineName=${this.machineName}`);
      void this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }
  clearHeartbeatTimer() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  async registerMachine() {
    if (this.companyIds.length === 0) {
      console.warn("[local-agent] No companies \u2014 skipping machine registration");
      return;
    }
    const slotsAvailable = this.slots.getAvailable();
    const row = {
      name: this.machineName,
      status: "online",
      last_heartbeat: (/* @__PURE__ */ new Date()).toISOString(),
      slots_claude_code: slotsAvailable.claude_code,
      slots_codex: slotsAvailable.codex,
      agent_version: this.agentVersion
    };
    let failures = 0;
    for (const companyId of this.companyIds) {
      const { error } = await this.dbClient.from("machines").upsert({ ...row, company_id: companyId }, { onConflict: "company_id,name" });
      if (error) {
        console.warn(`[local-agent] Machine registration failed for company ${companyId}: ${error.message}`);
        failures++;
      }
    }
    if (failures === 0) {
      console.log(`[local-agent] Machine registered for ${this.companyIds.length} company(ies)`);
    } else {
      console.warn(`[local-agent] Machine registration: ${this.companyIds.length - failures}/${this.companyIds.length} succeeded`);
    }
  }
  async sendHeartbeat() {
    if (this.stopped)
      return;
    const now = Date.now();
    const gapMs = now - this.lastHeartbeatSentAt;
    if (gapMs > MACHINE_DEAD_THRESHOLD_MS) {
      const gapMin = (gapMs / 6e4).toFixed(1);
      const runningJobs = this.killStaleJobsFn ? await this.killStaleJobsFn("daemon_heartbeat_gap") : 0;
      console.log(`[local-agent] Killing ${runningJobs} jobs \u2014 heartbeat gap of ${gapMin}m detected (likely sleep/network loss)`);
    }
    this.lastHeartbeatSentAt = now;
    const slotsAvailable = this.slots.getAvailable();
    const env = process.env["ZAZIG_ENV"] ?? "production";
    try {
      const { data: latestVersion, error: latestVersionErr } = await this.dbClient.from("agent_versions").select("version").eq("env", env).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latestVersionErr) {
        console.warn(`[local-agent] Failed to query latest agent version for env=${env}: ${latestVersionErr.message}`);
      } else if (latestVersion && latestVersion.version !== this.agentVersion) {
        this.onOutdatedDetected(this.agentVersion, latestVersion.version);
      }
    } catch (err) {
      console.warn(`[local-agent] Failed to query latest agent version for env=${env}: ${String(err)}`);
    }
    const heartbeat = {
      type: "heartbeat",
      protocolVersion: PROTOCOL_VERSION,
      machineName: this.machineName,
      slotsAvailable
    };
    const heartbeatOk = await this.sendToOrchestrator(heartbeat);
    if (heartbeatOk) {
      this.consecutiveHeartbeatFailures = 0;
    } else {
      this.consecutiveHeartbeatFailures++;
      console.error(`[local-agent] Heartbeat failure ${this.consecutiveHeartbeatFailures}/5 \u2014 machineName=${this.machineName}`);
      if (this.consecutiveHeartbeatFailures >= 5) {
        console.error(`[local-agent] 5 consecutive heartbeat failures \u2014 exiting for supervisor restart`);
        process.exit(1);
      }
    }
    if (!this.isRecoveryRunning) {
      this.isRecoveryRunning = true;
      try {
        const recovered = await recoverDispatchedJobs(this.dbClient, this.machineName, { companyIds: this.companyIds });
        if (recovered > 0) {
          console.log(`[local-agent] Heartbeat recovered ${recovered} missed job(s)`);
        }
      } catch (err) {
        console.warn(`[local-agent] Job recovery poll failed:`, err);
      } finally {
        this.isRecoveryRunning = false;
      }
    }
  }
  onOutdatedDetected(currentVersion, requiredVersion) {
    if (this.outdated)
      return;
    this.outdated = true;
    const warningMessage = `
\u26A0\uFE0F  UPDATE REQUIRED: running v${currentVersion}, latest is v${requiredVersion}. Run 'zazig update' to update.
`;
    const emitWarning = () => {
      process.stderr.write(warningMessage);
    };
    emitWarning();
    this.outdatedWarningTimer = setInterval(() => {
      emitWarning();
    }, 6e4);
    void this.closeOutdatedInteractiveSessions();
    this.startOutdatedExitPolling();
  }
  clearOutdatedWarningTimer() {
    if (this.outdatedWarningTimer !== null) {
      clearInterval(this.outdatedWarningTimer);
      this.outdatedWarningTimer = null;
    }
  }
  clearOutdatedExitPollTimer() {
    if (this.outdatedExitPollTimer !== null) {
      clearInterval(this.outdatedExitPollTimer);
      this.outdatedExitPollTimer = null;
    }
  }
  getActiveJobCount() {
    const available = this.slots.getAvailable();
    const activeClaudeJobs = Math.max(0, this.config.slots.claude_code - available.claude_code);
    const activeCodexJobs = Math.max(0, this.config.slots.codex - available.codex);
    return activeClaudeJobs + activeCodexJobs;
  }
  startOutdatedExitPolling() {
    if (this.outdatedExitPollTimer !== null)
      return;
    if (process.env["ZAZIG_EXIT_ON_OUTDATED"] !== "1") {
      console.warn("[local-agent] Outdated agent detected; auto-exit disabled (set ZAZIG_EXIT_ON_OUTDATED=1 to enable)");
      return;
    }
    const maybeExit = () => {
      const activeJobs = this.getActiveJobCount();
      if (activeJobs > 0) {
        console.warn(`[local-agent] Outdated agent waiting for ${activeJobs} active job(s) to complete`);
        return;
      }
      this.clearOutdatedExitPollTimer();
      console.warn("[local-agent] Outdated agent has no active jobs \u2014 exiting for update");
      void this.stop().finally(() => {
        process.exit(0);
      });
    };
    maybeExit();
    this.outdatedExitPollTimer = setInterval(maybeExit, 15e3);
  }
  async closeOutdatedInteractiveSessions() {
    let sessions = [];
    try {
      const { stdout } = await execFileAsync3("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf8" });
      sessions = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    } catch (err) {
      console.warn(`[local-agent] Could not enumerate tmux sessions while outdated: ${String(err)}`);
      return;
    }
    const companyPrefixes = /* @__PURE__ */ new Set();
    if (this.primaryCompanyId)
      companyPrefixes.add(this.primaryCompanyId.slice(0, 8));
    for (const companyId of this.companyIds) {
      companyPrefixes.add(companyId.slice(0, 8));
    }
    const targets = sessions.filter((sessionName) => {
      if (sessionName.startsWith("expert-"))
        return true;
      if (sessionName === `${this.machineName}-cpo`)
        return true;
      for (const prefix of companyPrefixes) {
        if (sessionName === `${this.machineName}-${prefix}-cpo`)
          return true;
      }
      return false;
    });
    for (const sessionName of targets) {
      try {
        await execFileAsync3("tmux", ["kill-session", "-t", sessionName], { encoding: "utf8" });
        console.warn(`[local-agent] Closed interactive tmux session while outdated: ${sessionName}`);
      } catch (err) {
        console.warn(`[local-agent] Failed to close tmux session ${sessionName}: ${String(err)}`);
      }
    }
  }
  // ---------------------------------------------------------------------------
  // Reconnection with exponential backoff
  // ---------------------------------------------------------------------------
  /**
   * Safely remove old channels before reconnecting.
   *
   * `removeChannel()` calls `WebSocket.close()` internally. If the WebSocket
   * is still in CONNECTING state, `ws` emits an 'error' event via
   * `process.nextTick`. Without a listener this is an unhandled error that
   * crashes the process. We attach a temporary listener to swallow it.
   */
  async cleanupChannels() {
    const conn = this.supabase.realtime?.conn;
    const swallowErr = (err) => {
      console.warn(`[local-agent] Swallowed WebSocket error during channel cleanup: ${err.message}`);
    };
    if (conn && typeof conn.on === "function") {
      conn.on("error", swallowErr);
    }
    if (this.channel) {
      try {
        await this.supabase.removeChannel(this.channel);
      } catch {
      }
      this.channel = null;
    }
  }
  scheduleReconnect() {
    if (this.stopped)
      return;
    this.clearReconnectTimer();
    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, this.reconnectAttempts), BACKOFF_MAX_MS);
    this.reconnectAttempts++;
    console.log(`[local-agent] Reconnecting in ${delay}ms (attempt #${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.cleanupChannels();
      await this.connect();
    }, delay);
  }
  clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
};

// ../local-agent/dist/expert-session-manager.js
import { mkdirSync as mkdirSync4, readFileSync as readFileSync5, writeFileSync as writeFileSync4, existsSync as existsSync5, rmSync as rmSync4 } from "node:fs";
import { join as join6, dirname as dirname3, resolve as resolve3 } from "node:path";
import { homedir as homedir4 } from "node:os";
import { execFile as execFile4 } from "node:child_process";
import { promisify as promisify4 } from "node:util";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var execFileAsync4 = promisify4(execFile4);
function shellEscape2(parts) {
  return parts.map((p) => `'${p.replace(/'/g, `'"'"'`)}'`).join(" ");
}
var AVAILABLE_CONTEXT_HEADING = "## Available Context";
var AVAILABLE_CONTEXT_SECTION = `${AVAILABLE_CONTEXT_HEADING}

Exec context skills are available in this session. To load an exec's current priorities, decisions, and working context:

- \`/as-cpo\` \u2014 CPO's context: product priorities, active decisions, strategic direction
- \`/as-cto\` \u2014 CTO's context: architecture decisions, technical constraints, infra state

Use these if you need to understand why your task was commissioned. Read the exec's memory files \u2014 do not modify them.`;
function assembleExpertBrief(brief) {
  if (brief.includes(AVAILABLE_CONTEXT_HEADING)) {
    return brief;
  }
  const trimmedBrief = brief.trimEnd();
  return `${trimmedBrief}

${AVAILABLE_CONTEXT_SECTION}`;
}
function resolveMcpServerPath2() {
  const thisDir = dirname3(fileURLToPath2(import.meta.url));
  const mjsPath = join6(thisDir, "agent-mcp-server.mjs");
  if (existsSync5(mjsPath))
    return mjsPath;
  return join6(thisDir, "agent-mcp-server.js");
}
function resolveRepoRoot2() {
  const thisDir = dirname3(fileURLToPath2(import.meta.url));
  const candidates = [
    resolve3(thisDir, "..", "..", ".."),
    process.cwd()
  ];
  for (const c of candidates) {
    if (existsSync5(join6(c, "packages")))
      return c;
  }
  return process.cwd();
}
function viewerSessionName(companyName) {
  return `zazig-view-${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
async function killTmuxSession2(sessionName) {
  try {
    await execFileAsync4("tmux", ["kill-session", "-t", sessionName]);
    console.log(`[expert] Killed stale tmux session: ${sessionName}`);
  } catch {
  }
}
async function isTmuxSessionAlive2(sessionName) {
  try {
    await execFileAsync4("tmux", ["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}
var ExpertSessionManager = class {
  machineId;
  companyId;
  supabase;
  supabaseUrl;
  supabaseAnonKey;
  repoManager;
  activeSessions = /* @__PURE__ */ new Map();
  activePollers = /* @__PURE__ */ new Map();
  exitingSessions = /* @__PURE__ */ new Set();
  constructor(opts) {
    this.machineId = opts.machineId;
    this.companyId = opts.companyId;
    this.supabase = opts.supabase;
    this.supabaseUrl = opts.supabaseUrl;
    this.supabaseAnonKey = opts.supabaseAnonKey;
    this.repoManager = opts.repoManager;
  }
  async handleStartExpert(msg) {
    const sessionId = msg.session_id;
    const shortId = sessionId.slice(0, 8);
    const tmuxSessionName = `expert-${shortId}`;
    const displayName = msg.display_name ?? `Expert ${shortId}`;
    console.log(`[expert] Starting expert session ${sessionId} (${displayName})`);
    const workspaceDir = join6(homedir4(), ".zazigv2", `expert-${sessionId}`);
    mkdirSync4(workspaceDir, { recursive: true });
    let repoDir;
    let bareRepoDir;
    let startCommitHash;
    if (msg.project_id && !msg.repo_url || !msg.project_id && msg.repo_url) {
      console.error(`[expert] Invalid start_expert payload for ${sessionId}: project_id and repo_url must both be set together`);
      await this.updateSessionStatus(sessionId, "failed");
      return;
    }
    if (msg.project_id && msg.repo_url) {
      try {
        const projectName = msg.repo_url.split("/").pop()?.replace(/\.git$/, "") ?? msg.project_id;
        bareRepoDir = await this.repoManager.ensureRepo(msg.repo_url, projectName);
        const worktreeTarget = join6(workspaceDir, "repo");
        const branch = msg.branch ?? "master";
        try {
          await execFileAsync4("git", [
            "-C",
            bareRepoDir,
            "worktree",
            "remove",
            "--force",
            worktreeTarget
          ]);
        } catch {
        }
        rmSync4(worktreeTarget, { recursive: true, force: true });
        await execFileAsync4("git", ["-C", bareRepoDir, "worktree", "prune"]);
        await this.repoManager.fetchBranchForExpert(projectName, branch);
        await execFileAsync4("git", [
          "-C",
          bareRepoDir,
          "worktree",
          "add",
          "--detach",
          worktreeTarget,
          `refs/heads/${branch}`
        ]);
        const { stdout } = await execFileAsync4("git", ["-C", worktreeTarget, "rev-parse", "HEAD"]);
        startCommitHash = stdout.trim();
        repoDir = worktreeTarget;
        console.log(`[expert] Git worktree created at ${worktreeTarget} (branch: ${branch})`);
        console.log(`[expert] Worktree at commit: ${startCommitHash.slice(0, 8)}`);
      } catch (err) {
        console.error(`[expert] Failed to create git worktree:`, err);
        await this.updateSessionStatus(sessionId, "failed");
        return;
      }
    }
    const effectiveWorkspaceDir = repoDir ?? workspaceDir;
    try {
      const mcpServerPath = resolveMcpServerPath2();
      const repoRoot = resolveRepoRoot2();
      const claudeMdParts = [];
      if (msg.role.prompt) {
        claudeMdParts.push(msg.role.prompt);
      }
      claudeMdParts.push(`
## Expert Session Instructions

You are working as an interactive expert. Your task brief is in \`.claude/expert-brief.md\`.

### Workflow
1. Read and understand the brief in \`.claude/expert-brief.md\`
2. Work through the brief methodically
3. Show diffs before merging any changes
4. When done, merge your work to master

### Ending the Session
When the user says "wrap up", "I'm done", "finish up", or similar:
1. Write a 2-3 sentence summary of what was accomplished to \`.claude/expert-report.md\`
2. Tell the user: "Report written. Type /quit (or press Ctrl+C) to close this session."

When greeting the user, always include: "When you're done, say 'wrap up' and I'll write a summary report. Then type /quit (or press Ctrl+C) to close the session."

**Always write the report before the session ends.** The report is read by the CPO after the session closes.
`);
      const claudeMdContent = claudeMdParts.join("\n\n");
      setupJobWorkspace({
        workspaceDir: effectiveWorkspaceDir,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId: sessionId,
        companyId: this.companyId,
        role: "expert",
        claudeMdContent,
        skills: msg.role.skills,
        repoSkillsDir: join6(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join6(repoRoot, ".claude", "skills"),
        mcpTools: msg.role.mcp_tools,
        tmuxSession: tmuxSessionName
      });
      const claudeDir = join6(effectiveWorkspaceDir, ".claude");
      mkdirSync4(claudeDir, { recursive: true });
      writeFileSync4(join6(claudeDir, "expert-brief.md"), assembleExpertBrief(msg.brief));
      const settingsPath = join6(claudeDir, "settings.json");
      const existingSettings = JSON.parse(readFileSync5(settingsPath, "utf8"));
      if (msg.role.settings_overrides) {
        const overrides = msg.role.settings_overrides;
        for (const [key, value] of Object.entries(overrides)) {
          if (key === "hooks" || key === "permissions")
            continue;
          existingSettings[key] = value;
        }
      }
      existingSettings.hooks = {
        ...existingSettings.hooks ?? {},
        ...msg.role.settings_overrides?.hooks ?? {},
        SessionStart: [
          ...msg.role.settings_overrides?.hooks?.SessionStart ?? [],
          {
            matcher: "",
            hooks: [{
              type: "command",
              command: `cat ${shellEscape2([join6(claudeDir, "expert-brief.md")])} && echo "" && echo "---" && echo "When you're finished, say 'wrap up' \u2014 the expert will write a summary report. Then type /quit (or press Ctrl+C) to close."`
            }]
          }
        ]
      };
      if (msg.role.settings_overrides?.permissions) {
        const overridePerms = msg.role.settings_overrides.permissions;
        if (Array.isArray(overridePerms.allow)) {
          const existingAllow = existingSettings.permissions?.allow ?? [];
          existingSettings.permissions = {
            ...existingSettings.permissions,
            allow: [.../* @__PURE__ */ new Set([...existingAllow, ...overridePerms.allow])]
          };
        }
      }
      writeFileSync4(settingsPath, JSON.stringify(existingSettings, null, 2));
      console.log(`[expert] Workspace configured at ${effectiveWorkspaceDir}`);
    } catch (err) {
      console.error(`[expert] Failed to set up workspace:`, err);
      await this.updateSessionStatus(sessionId, "failed");
      return;
    }
    try {
      if (await isTmuxSessionAlive2(tmuxSessionName)) {
        await killTmuxSession2(tmuxSessionName);
      }
      const claudeCmd = shellEscape2([
        "claude",
        "--model",
        msg.model
      ]);
      const shellCmd = `unset CLAUDECODE; ${claudeCmd}`;
      await execFileAsync4("tmux", [
        "new-session",
        "-d",
        "-s",
        tmuxSessionName,
        "-c",
        effectiveWorkspaceDir,
        shellCmd
      ]);
      console.log(`[expert] Spawned tmux session: ${tmuxSessionName} (cwd=${effectiveWorkspaceDir})`);
    } catch (err) {
      console.error(`[expert] Failed to spawn tmux session:`, err);
      await this.updateSessionStatus(sessionId, "failed");
      return;
    }
    await this.updateSessionStatus(sessionId, "running");
    const viewerLink = await this.linkToViewerTui(msg, tmuxSessionName, displayName);
    const sessionState = {
      sessionId,
      workspaceDir,
      effectiveWorkspaceDir,
      repoDir,
      bareRepoDir,
      branch: repoDir ? msg.branch ?? "master" : void 0,
      startCommit: repoDir ? startCommitHash : void 0,
      displayName,
      tmuxSession: tmuxSessionName,
      viewerSession: viewerLink?.viewerSession,
      viewerWindowName: viewerLink?.viewerWindowName
    };
    this.activeSessions.set(sessionId, sessionState);
    this.startExitPolling(sessionState);
    console.log(`[expert] Expert session ${sessionId} is running (tmux=${tmuxSessionName})`);
  }
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  async updateSessionStatus(sessionId, status) {
    try {
      const update = { status };
      if (status === "running") {
        update.started_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      const { error } = await this.supabase.from("expert_sessions").update(update).eq("id", sessionId);
      if (error) {
        console.warn(`[expert] DB update failed for session ${sessionId}: ${error.message}`);
      }
    } catch (err) {
      console.error(`[expert] DB update error for session ${sessionId}:`, err);
    }
  }
  async linkToViewerTui(msg, tmuxSessionName, displayName) {
    let viewerSession;
    if (msg.company_name) {
      viewerSession = viewerSessionName(msg.company_name);
    } else {
      try {
        const { stdout } = await execFileAsync4("tmux", [
          "list-sessions",
          "-F",
          "#{session_name}"
        ]);
        const sessions = stdout.trim().split("\n");
        viewerSession = sessions.find((s) => s.startsWith("zazig-view-"));
      } catch {
      }
    }
    if (!viewerSession) {
      console.log(`[expert] No viewer session found \u2014 expert window not linked to TUI`);
      return null;
    }
    if (!await isTmuxSessionAlive2(viewerSession)) {
      console.log(`[expert] Viewer session ${viewerSession} not alive \u2014 skipping TUI linking`);
      return null;
    }
    try {
      const { stdout: windowId } = await execFileAsync4("tmux", [
        "list-windows",
        "-t",
        tmuxSessionName,
        "-F",
        "#{window_id}"
      ]);
      const expertWindowId = windowId.trim().split("\n")[0];
      if (!expertWindowId) {
        console.warn(`[expert] Could not determine window ID for ${tmuxSessionName}`);
        return null;
      }
      const viewerWindowName = displayName.toUpperCase().replace(/\s+/g, "-");
      await execFileAsync4("tmux", [
        "link-window",
        "-s",
        expertWindowId,
        "-t",
        `${viewerSession}:`
      ]);
      await execFileAsync4("tmux", [
        "rename-window",
        "-t",
        expertWindowId,
        viewerWindowName
      ]);
      try {
        await execFileAsync4("tmux", [
          "select-window",
          "-t",
          `${viewerSession}:${viewerWindowName}`
        ]);
      } catch {
      }
      console.log(`[expert] Linked expert window to viewer session ${viewerSession}`);
      return { viewerSession, viewerWindowName };
    } catch (err) {
      console.warn(`[expert] Failed to link expert window to viewer TUI:`, err);
      return null;
    }
  }
  startExitPolling(session) {
    const existing = this.activePollers.get(session.sessionId);
    if (existing) {
      clearInterval(existing);
    }
    const interval = setInterval(() => {
      void (async () => {
        try {
          if (this.exitingSessions.has(session.sessionId))
            return;
          const alive = await isTmuxSessionAlive2(session.tmuxSession);
          if (!alive) {
            clearInterval(interval);
            this.activePollers.delete(session.sessionId);
            await this.handleSessionExit(session);
          }
        } catch (err) {
          console.error("[expert] Poll error:", err);
        }
      })();
    }, 1e4);
    this.activePollers.set(session.sessionId, interval);
  }
  async handleSessionExit(session) {
    if (this.exitingSessions.has(session.sessionId))
      return;
    this.exitingSessions.add(session.sessionId);
    const poller = this.activePollers.get(session.sessionId);
    if (poller) {
      clearInterval(poller);
      this.activePollers.delete(session.sessionId);
    }
    let summary = null;
    const reportPath = join6(session.effectiveWorkspaceDir, ".claude", "expert-report.md");
    try {
      if (existsSync5(reportPath)) {
        summary = readFileSync5(reportPath, "utf8");
      }
    } catch (err) {
      console.warn(`[expert] Failed to read report for session ${session.sessionId}:`, err);
    }
    try {
      const { error } = await this.supabase.from("expert_sessions").update({
        status: "completed",
        summary,
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", session.sessionId);
      if (error) {
        console.warn(`[expert] Failed to mark session ${session.sessionId} completed: ${error.message}`);
      }
    } catch (err) {
      console.warn(`[expert] Error updating expert session ${session.sessionId}:`, err);
    }
    await this.injectSummaryIntoCpo(session, summary);
    await this.switchViewerToCpo(session);
    await this.pushUnpushedCommits(session);
    await this.cleanupWorktree(session);
    try {
      rmSync4(session.workspaceDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[expert] Failed to remove workspace ${session.workspaceDir}:`, err);
    }
    this.activeSessions.delete(session.sessionId);
    this.exitingSessions.delete(session.sessionId);
    console.log(`[expert] Session ${session.sessionId} exited and cleaned up`);
  }
  async injectSummaryIntoCpo(session, summary) {
    const companyPrefix = this.companyId ? `${this.companyId.slice(0, 8)}-` : "";
    const cpoSessionName = `${this.machineId}-${companyPrefix}cpo`;
    if (!await isTmuxSessionAlive2(cpoSessionName)) {
      console.warn(`[expert] CPO session ${cpoSessionName} not found; skipping summary injection`);
      return;
    }
    const message = summary ? `[Expert Report - ${session.displayName}] ${summary}` : "[Expert session ended - no report written]";
    const singleLine = message.replace(/\r?\n/g, " ").trim();
    if (!singleLine)
      return;
    try {
      await execFileAsync4("tmux", ["send-keys", "-t", cpoSessionName, "-l", singleLine]);
      await execFileAsync4("tmux", ["send-keys", "-t", cpoSessionName, "Enter"]);
      console.log(`[expert] Injected expert summary into CPO session ${cpoSessionName}`);
    } catch (err) {
      console.warn(`[expert] Failed to inject summary into CPO session ${cpoSessionName}:`, err);
    }
  }
  async switchViewerToCpo(session) {
    if (!session.viewerSession)
      return;
    if (!await isTmuxSessionAlive2(session.viewerSession))
      return;
    if (session.viewerWindowName) {
      try {
        await execFileAsync4("tmux", [
          "unlink-window",
          "-k",
          "-t",
          `${session.viewerSession}:${session.viewerWindowName}`
        ]);
      } catch (err) {
        console.warn(`[expert] Failed to unlink expert window ${session.viewerWindowName} from ${session.viewerSession}:`, err);
      }
    }
    const directTargets = [
      `${session.viewerSession}:CPO`,
      `${session.viewerSession}:cpo`
    ];
    for (const target of directTargets) {
      try {
        await execFileAsync4("tmux", ["select-window", "-t", target]);
        return;
      } catch {
      }
    }
    try {
      const { stdout } = await execFileAsync4("tmux", [
        "list-windows",
        "-t",
        session.viewerSession,
        "-F",
        "#{window_index}:#{window_name}"
      ]);
      const lines = stdout.trim().split("\n").filter(Boolean);
      const cpoLine = lines.find((line) => line.split(":")[1]?.toLowerCase() === "cpo");
      const cpoIndex = cpoLine?.split(":")[0];
      if (!cpoIndex) {
        console.warn(`[expert] Could not find CPO window in viewer session ${session.viewerSession}`);
        return;
      }
      await execFileAsync4("tmux", ["select-window", "-t", `${session.viewerSession}:${cpoIndex}`]);
    } catch (err) {
      console.warn(`[expert] Failed to switch viewer ${session.viewerSession} back to CPO:`, err);
    }
  }
  /**
   * Safety net: before destroying the worktree, check if the expert made
   * commits that were never pushed. If so, push them to origin so work
   * isn't silently lost when the session ends.
   */
  async pushUnpushedCommits(session) {
    if (!session.repoDir || !session.bareRepoDir || !session.branch || !session.startCommit)
      return;
    try {
      const { stdout: currentHead } = await execFileAsync4("git", [
        "-C",
        session.repoDir,
        "rev-parse",
        "HEAD"
      ]);
      const head2 = currentHead.trim();
      if (head2 === session.startCommit) {
        return;
      }
      console.log(`[expert] Session ${session.sessionId} has unpushed commits (${session.startCommit.slice(0, 8)}..${head2.slice(0, 8)}). Pushing to origin/${session.branch}...`);
      try {
        await execFileAsync4("git", [
          "-C",
          session.repoDir,
          "push",
          "origin",
          `HEAD:refs/heads/${session.branch}`
        ]);
        console.log(`[expert] Pushed unpushed commits to origin/${session.branch}`);
      } catch (pushErr) {
        const rescueBranch = `rescue/expert-${session.sessionId.slice(0, 8)}`;
        console.warn(`[expert] Push to origin/${session.branch} failed \u2014 saving work to ${rescueBranch}`);
        try {
          await execFileAsync4("git", [
            "-C",
            session.repoDir,
            "push",
            "origin",
            `HEAD:refs/heads/${rescueBranch}`
          ]);
          console.log(`[expert] Saved work to rescue branch origin/${rescueBranch}`);
        } catch (rescueErr) {
          console.error(`[expert] CRITICAL: Failed to push rescue branch for session ${session.sessionId}. Work may be lost.`, rescueErr);
        }
      }
    } catch (err) {
      console.warn(`[expert] Failed to check for unpushed commits in session ${session.sessionId}:`, err);
    }
  }
  async cleanupWorktree(session) {
    if (!session.repoDir)
      return;
    try {
      if (session.bareRepoDir) {
        await execFileAsync4("git", [
          "-C",
          session.bareRepoDir,
          "worktree",
          "remove",
          "--force",
          session.repoDir
        ]);
        await execFileAsync4("git", [
          "-C",
          session.bareRepoDir,
          "worktree",
          "prune"
        ]);
      } else {
        await execFileAsync4("git", ["worktree", "remove", "--force", session.repoDir]);
      }
      console.log(`[expert] Removed git worktree ${session.repoDir}`);
    } catch (err) {
      console.warn(`[expert] Failed to remove git worktree ${session.repoDir}:`, err);
    }
  }
  cleanup() {
    for (const poller of this.activePollers.values()) {
      clearInterval(poller);
    }
    this.activePollers.clear();
  }
  /** Returns active session state (for exit detection poller). */
  getActiveSessions() {
    return this.activeSessions;
  }
};

// ../local-agent/dist/fix-agent.js
import { execFile as execFile5 } from "node:child_process";
import { promisify as promisify5 } from "node:util";
var execFileAsync5 = promisify5(execFile5);
var FixAgentManager = class {
  activeAgents = /* @__PURE__ */ new Map();
  repoDir;
  constructor(repoDir) {
    this.repoDir = repoDir;
  }
  /**
   * Spawn a fix agent for the given feature. Idempotent — if an agent is
   * already active for this featureId, the call is a no-op.
   */
  async spawn(params) {
    if (this.activeAgents.has(params.featureId))
      return;
    const sanitizedId = params.featureId.replace(/[^a-z0-9-]/gi, "").slice(0, 8);
    if (!sanitizedId) {
      console.error(`[fix-agent] featureId "${params.featureId}" is empty after sanitization \u2014 aborting spawn`);
      return;
    }
    const sessionName = `fix-${sanitizedId}`;
    const worktreePath = await createWorktree(this.repoDir, params.featureBranch);
    const safeChannel = sanitizeSlackField(params.slackChannel);
    const safeThread = sanitizeSlackField(params.slackThreadTs);
    const prompt = [
      "You are a fix agent for a feature currently in human testing.",
      "A human is testing this feature and will describe issues in Slack.",
      "Your job: fix issues on the current branch with minimal changes.",
      "After each fix, commit and push so the test server auto-redeploys.",
      "Only fix what the human reports. Do not refactor or add features.",
      `Slack channel: ${safeChannel}`,
      `Thread: ${safeThread}`
    ].join(" ");
    const shellCmd = `unset CLAUDECODE; ${shellEscape3(["claude", "-p", prompt])}`;
    await execFileAsync5("tmux", [
      "new-session",
      "-d",
      "-s",
      sessionName,
      "-c",
      worktreePath,
      shellCmd
    ]);
    this.activeAgents.set(params.featureId, {
      featureId: params.featureId,
      sessionName,
      worktreePath
    });
    console.log(`[fix-agent] Spawned fix agent \u2014 featureId=${params.featureId}, session=${sessionName}, worktree=${worktreePath}`);
  }
  /**
   * Clean up a fix agent: kill the tmux session and remove the worktree.
   * No-op if no agent is active for this featureId.
   */
  async cleanup(featureId) {
    const agent = this.activeAgents.get(featureId);
    if (!agent)
      return;
    try {
      await execFileAsync5("tmux", ["kill-session", "-t", agent.sessionName]);
      console.log(`[fix-agent] Killed tmux session: ${agent.sessionName}`);
    } catch {
    }
    await removeWorktree(this.repoDir, agent.worktreePath);
    this.activeAgents.delete(featureId);
    console.log(`[fix-agent] Cleaned up fix agent \u2014 featureId=${featureId}`);
  }
  /** Check whether a fix agent is active for the given featureId. */
  isActive(featureId) {
    return this.activeAgents.has(featureId);
  }
};
function sanitizeSlackField(s) {
  return s.replace(/[`$\\"'\n\r]/g, "").slice(0, 200);
}
function shellEscape3(parts) {
  return parts.map((p) => `'${p.replace(/'/g, `'"'"'`)}'`).join(" ");
}

// ../local-agent/dist/verifier.js
import { execFile as execFile6 } from "node:child_process";
import { promisify as promisify6 } from "node:util";
var execFileAsync6 = promisify6(execFile6);
function getErrorOutput(error) {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : String(error);
  return [message, stdout, stderr].filter((part) => part.trim().length > 0).join("\n");
}
var defaultRunCommand = async (file, args, options) => {
  const { stdout, stderr } = await execFileAsync6(file, args, options);
  return {
    stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
    stderr: typeof stderr === "string" ? stderr : String(stderr ?? "")
  };
};
var JobVerifier = class {
  repoDir;
  machineId;
  send;
  branchOps;
  runCommand;
  constructor(options) {
    this.repoDir = options.repoDir;
    this.machineId = options.machineId;
    this.send = options.send;
    this.branchOps = options.branchOps ?? { rebaseOnBranch, mergeJobIntoFeature };
    this.runCommand = options.runCommand ?? defaultRunCommand;
  }
  async verify(msg) {
    const { jobId, featureBranch, jobBranch, acceptanceTests } = msg;
    const workDir = msg.repoPath ?? this.repoDir;
    const rebaseResult = await this.branchOps.rebaseOnBranch(workDir, jobBranch, featureBranch);
    if (!rebaseResult.success) {
      await this.sendResult(jobId, false, `Rebase failed:
${rebaseResult.error ?? "unknown rebase error"}`);
      return;
    }
    const testStep = await this.runStep(workDir, "npm", ["test"], "tests");
    if (!testStep.success) {
      await this.sendResult(jobId, false, `Tests failed:
${testStep.output}`);
      return;
    }
    const lintStep = await this.runStep(workDir, "npm", ["run", "lint"], "lint");
    if (!lintStep.success) {
      await this.sendResult(jobId, false, `Lint failed:
${lintStep.output}`);
      return;
    }
    const typecheckStep = await this.runStep(workDir, "npm", ["run", "typecheck"], "typecheck");
    if (!typecheckStep.success) {
      await this.sendResult(jobId, false, `Typecheck failed:
${typecheckStep.output}`);
      return;
    }
    const mergeResult = await this.branchOps.mergeJobIntoFeature(workDir, jobBranch, featureBranch);
    if (!mergeResult.success) {
      await this.sendResult(jobId, false, `Merge failed:
${mergeResult.error ?? "unknown merge error"}`);
      return;
    }
    const verificationOutput = [
      `Acceptance tests:
${acceptanceTests}`,
      `Tests:
${testStep.output}`,
      `Lint:
${lintStep.output}`,
      `Typecheck:
${typecheckStep.output}`,
      "Merge: success"
    ].join("\n\n");
    await this.sendResult(jobId, true, verificationOutput, "Verification checks passed and merged");
  }
  async runStep(cwd, file, args, label) {
    try {
      const { stdout, stderr } = await this.runCommand(file, args, {
        cwd,
        encoding: "utf8",
        timeout: 3e5
      });
      const output = [stdout, stderr].filter((part) => part.trim().length > 0).join("\n");
      return { success: true, output: output || `${label} completed` };
    } catch (error) {
      return {
        success: false,
        output: getErrorOutput(error)
      };
    }
  }
  async sendResult(jobId, passed, testOutput, reviewSummary) {
    await this.send({
      type: "verify_result",
      protocolVersion: 1,
      jobId,
      machineId: this.machineId,
      passed,
      testOutput,
      ...reviewSummary ? { reviewSummary } : {}
    });
  }
};

// ../local-agent/dist/version.js
import { execSync } from "node:child_process";
function runGitCommand(command, cwd) {
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: "pipe",
      cwd
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}
function resolveAgentVersion() {
  const env = process.env["ZAZIG_ENV"] ?? "production";
  const repoRoot = process.env["ZAZIG_REPO_PATH"] ?? process.cwd();
  if (env === "staging") {
    const localAgentHash = runGitCommand("git log -1 --format=%h -- packages/local-agent/", repoRoot);
    if (localAgentHash)
      return localAgentHash;
  }
  if (typeof AGENT_BUILD_HASH !== "undefined" && AGENT_BUILD_HASH) {
    return AGENT_BUILD_HASH;
  }
  const headHash = runGitCommand("git rev-parse --short HEAD", repoRoot);
  if (headHash)
    return headHash;
  return "dev";
}

// ../local-agent/dist/index.js
var companySlug = process.env["ZAZIG_COMPANY_ID"]?.slice(0, 8) ?? "default";
var logPath = join7(homedir5(), ".zazigv2", `local-agent-${companySlug}.log`);
var logStream = createWriteStream(logPath, { flags: "a" });
var origLog = console.log;
var origErr = console.error;
var origWarn = console.warn;
var ts = () => (/* @__PURE__ */ new Date()).toISOString();
console.log = (...args) => {
  const line = `${ts()} ${args.join(" ")}
`;
  logStream.write(line);
  origLog(...args);
};
console.error = (...args) => {
  const line = `${ts()} ERROR ${args.join(" ")}
`;
  logStream.write(line);
  origErr(...args);
};
console.warn = (...args) => {
  const line = `${ts()} WARN ${args.join(" ")}
`;
  logStream.write(line);
  origWarn(...args);
};
process.on("unhandledRejection", (reason) => {
  console.error("[local-agent] Unhandled rejection (process NOT exiting):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[local-agent] Uncaught exception (process NOT exiting):", err);
});
var shuttingDown = false;
var REPO_REFRESH_INTERVAL_MS = 5 * 60 * 1e3;
async function main() {
  console.log("[local-agent] Initializing...");
  const config = loadConfig();
  console.log(`[local-agent] Config loaded \u2014 machine=${config.name}, slots=${JSON.stringify(config.slots)}`);
  const slots = new SlotTracker(config.slots);
  const agentVersion = resolveAgentVersion();
  const conn = new AgentConnection(config, slots, agentVersion);
  const executor = new JobExecutor(config.name, config.company_id ?? "", slots, (msg) => conn.sendMessage(msg), conn.dbClient, config.supabase.url, config.supabase.anon_key);
  conn.setKillStaleJobsFn((reason) => executor.killAllRunningJobs(reason));
  const verifier = new JobVerifier({
    repoDir: process.cwd(),
    machineId: config.name,
    send: (msg) => conn.sendMessage(msg)
  });
  const expertManager = new ExpertSessionManager({
    machineId: config.name,
    companyId: config.company_id ?? "",
    supabase: conn.dbClient,
    supabaseUrl: config.supabase.url,
    supabaseAnonKey: config.supabase.anon_key,
    repoManager: executor.repoManager
  });
  const _fixAgentManager = new FixAgentManager(process.cwd());
  conn.onMessage((msg) => {
    switch (msg.type) {
      case "start_job":
        if (shuttingDown) {
          console.log(`[local-agent] SHUTDOWN: Rejecting StartJob for jobId=${msg.jobId} \u2014 daemon is shutting down`);
          return;
        }
        console.log(`[local-agent] Received start_job \u2014 jobId=${msg.jobId}, cardId=${msg.cardId}, slotType=${msg.slotType}, complexity=${msg.complexity}, model=${msg.model}`);
        executor.handleStartJob(msg).catch((err) => {
          console.error(`[local-agent] FATAL: handleStartJob crashed for jobId=${msg.jobId}:`, err);
        });
        break;
      case "stop_job":
        console.log(`[local-agent] Received stop_job \u2014 jobId=${msg.jobId}, reason=${msg.reason}`);
        executor.handleStopJob(msg).catch((err) => {
          console.error(`[local-agent] FATAL: handleStopJob crashed for jobId=${msg.jobId}:`, err);
        });
        break;
      case "health_check":
        console.log("[local-agent] Received health_check \u2014 heartbeat will be sent on next interval");
        break;
      case "message_inbound":
        console.log(`[local-agent] Received message_inbound \u2014 conversationId=${msg.conversationId}, from=${msg.from}`);
        executor.handleMessageInbound(msg);
        break;
      case "job_unblocked":
        console.log(`[local-agent] Job ${msg.jobId} unblocked \u2014 answer: ${msg.answer.slice(0, 80)}`);
        void executor.handleJobUnblocked(msg);
        break;
      case "verify_job":
        console.log(`[local-agent] Received verify_job \u2014 jobId=${msg.jobId}, featureBranch=${msg.featureBranch}, jobBranch=${msg.jobBranch}`);
        void verifier.verify(msg);
        break;
      case "start_expert":
        console.log(`[local-agent] Received start_expert \u2014 sessionId=${msg.session_id}`);
        expertManager.handleStartExpert(msg).catch((err) => {
          console.error(`[local-agent] FATAL: handleStartExpert crashed for session=${msg.session_id}:`, err);
        });
        break;
      // Legacy message types — orchestrator no longer sends these but they remain
      // in the OrchestratorMessage union for backward compatibility during rollout.
      case "deploy_to_test":
      case "teardown_test":
        console.warn(`[local-agent] Ignoring deprecated message type: ${msg.type}`);
        break;
      default: {
        const _exhaustive = msg;
        console.warn("[local-agent] Unhandled message type:", _exhaustive);
      }
    }
  });
  await conn.start();
  await recoverDispatchedJobs(conn.dbClient, config.name, {
    gracePeriodMs: 0,
    companyIds: conn.companyIds
  });
  const companyId = process.env["ZAZIG_COMPANY_ID"];
  let rolePromptChannel = null;
  let repoRefreshTimer = null;
  if (companyId) {
    await discoverAndSpawnPersistentAgents(config.supabase.url, config.supabase.anon_key, companyId, executor);
    let refreshRunning = false;
    repoRefreshTimer = setInterval(() => {
      void (async () => {
        if (refreshRunning)
          return;
        refreshRunning = true;
        try {
          const projects = executor.getCompanyProjects();
          for (const project of projects) {
            if (!project.repo_url)
              continue;
            try {
              await executor.repoManager.refreshWorktree(project.name);
            } catch (err) {
              console.warn(`[daemon] repo refresh failed for ${project.name}:`, err);
            }
          }
        } finally {
          refreshRunning = false;
        }
      })();
    }, REPO_REFRESH_INTERVAL_MS);
    rolePromptChannel = subscribeToRolePromptHotReload(conn, config.name, config.supabase.url, config.supabase.anon_key, companyId, executor);
  }
  const shutdown = async (signal) => {
    if (shuttingDown) {
      console.log(`[local-agent] SHUTDOWN: Duplicate ${signal} signal ignored`);
      return;
    }
    shuttingDown = true;
    console.log(`[local-agent] SHUTDOWN: Received ${signal}`);
    if (rolePromptChannel) {
      try {
        await conn.supabase.removeChannel(rolePromptChannel);
      } catch (err) {
        console.warn("[local-agent] Failed to remove role prompt channel during shutdown:", err);
      }
      rolePromptChannel = null;
    }
    if (repoRefreshTimer) {
      clearInterval(repoRefreshTimer);
      repoRefreshTimer = null;
    }
    const gracePeriodMs = parseInt(process.env["ZAZIG_GRACEFUL_SHUTDOWN_MS"] ?? "10000", 10);
    console.log(`[local-agent] SHUTDOWN: Grace period started (${gracePeriodMs}ms)`);
    const activeJobIds = executor.getActiveJobIds();
    for (const jobId of activeJobIds) {
      try {
        const { data, error } = await conn.dbClient.from("jobs").update({ status: "queued", blocked_reason: "daemon shutdown \u2014 awaiting re-dispatch" }).eq("id", jobId).eq("status", "executing").select("id");
        if (error) {
          console.error(`[local-agent] SHUTDOWN: DB transition error for job ${jobId}:`, error);
        } else if (!data || data.length === 0) {
          console.log(`[local-agent] SHUTDOWN: Job ${jobId} already completed \u2014 skipping transition`);
        } else {
          console.log(`[local-agent] SHUTDOWN: Job ${jobId} transitioned to queued`);
        }
      } catch (err) {
        console.error(`[local-agent] SHUTDOWN: DB transition error for job ${jobId}:`, err);
      }
    }
    try {
      const notification = {
        type: "daemon_shutdown_notification",
        protocolVersion: PROTOCOL_VERSION,
        machineId: config.name,
        affectedJobIds: activeJobIds
      };
      await conn.sendMessage(notification);
      console.log("[local-agent] SHUTDOWN: DaemonShutdownNotification sent");
    } catch (err) {
      console.error("[local-agent] SHUTDOWN: Failed to send DaemonShutdownNotification:", err);
    }
    await new Promise((resolve4) => setTimeout(resolve4, gracePeriodMs));
    console.log("[local-agent] SHUTDOWN: Grace period wait complete");
    console.log("[local-agent] SHUTDOWN: Force-kill phase start");
    expertManager.cleanup();
    await executor.stopAll();
    console.log("[local-agent] SHUTDOWN: Channel closure");
    const stopPromise = conn.stop();
    const timeoutPromise = new Promise((resolve4) => setTimeout(resolve4, 5e3));
    await Promise.race([stopPromise, timeoutPromise]);
    console.log("[local-agent] SHUTDOWN: Exit");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  console.log("[local-agent] Daemon running. Press Ctrl+C to stop.");
}
async function fetchPersistentAgentDefinitions(supabaseUrl, anonKey, companyId) {
  const url = `${supabaseUrl}/functions/v1/company-persistent-jobs?company_id=${encodeURIComponent(companyId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey
    }
  });
  if (!res.ok) {
    const body2 = await res.text().catch(() => "");
    throw new Error(`Failed to fetch persistent jobs: HTTP ${res.status} \u2014 body: ${body2.slice(0, 500)}`);
  }
  const payload = await res.json();
  if (Array.isArray(payload)) {
    return { jobs: payload, companyProjects: [] };
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Persistent jobs endpoint returned invalid JSON payload");
  }
  const body = payload;
  const jobs = Array.isArray(body["jobs"]) ? body["jobs"] : Array.isArray(body["persistent_jobs"]) ? body["persistent_jobs"] : Array.isArray(body["persistentJobs"]) ? body["persistentJobs"] : [];
  const projects = Array.isArray(body["company_projects"]) ? body["company_projects"] : Array.isArray(body["companyProjects"]) ? body["companyProjects"] : Array.isArray(body["projects"]) ? body["projects"] : [];
  const companyProjects = [];
  for (const project of projects) {
    if (!project || typeof project !== "object")
      continue;
    const record = project;
    const name = typeof record["name"] === "string" ? record["name"] : "";
    const repoUrl = typeof record["repo_url"] === "string" ? record["repo_url"] : typeof record["repoUrl"] === "string" ? record["repoUrl"] : "";
    if (!name || !repoUrl)
      continue;
    companyProjects.push({ name, repo_url: repoUrl });
  }
  return { jobs, companyProjects };
}
async function discoverAndSpawnPersistentAgents(supabaseUrl, anonKey, companyId, executor) {
  try {
    const { jobs, companyProjects } = await fetchPersistentAgentDefinitions(supabaseUrl, anonKey, companyId);
    console.log(`[local-agent] Discovered ${jobs.length} persistent agent(s) for company ${companyId}`);
    console.log(`[local-agent] Discovered ${companyProjects.length} project repo(s) for company ${companyId}`);
    for (const project of companyProjects) {
      try {
        await executor.repoManager.ensureRepo(project.repo_url, project.name);
        await executor.repoManager.ensureWorktree(project.name);
      } catch (err) {
        console.error(`[local-agent] Failed to initialize worktree for project ${project.name}:`, err);
      }
    }
    executor.setCompanyProjects(companyProjects);
    for (const job of jobs) {
      await executor.spawnPersistentAgent(job, companyId);
    }
  } catch (err) {
    console.error(`[local-agent] Error during persistent agent discovery:`, err);
  }
}
function subscribeToRolePromptHotReload(conn, machineId, supabaseUrl, anonKey, companyId, executor) {
  const inFlightRoles = /* @__PURE__ */ new Set();
  const channelName = `agent:${machineId}:${companyId}:role-prompt-hot-reload`;
  const channel = conn.supabase.channel(channelName).on("postgres_changes", { event: "UPDATE", schema: "public", table: "roles" }, (payload) => {
    void (async () => {
      const nextRow = payload.new ?? {};
      const prevRow = payload.old ?? {};
      const role = typeof nextRow.name === "string" ? nextRow.name : "";
      const prevPrompt = typeof prevRow.prompt === "string" ? prevRow.prompt : "";
      const nextPrompt = typeof nextRow.prompt === "string" ? nextRow.prompt : "";
      if (!role || prevPrompt === nextPrompt)
        return;
      if (!executor.hasPersistentAgent(role)) {
        return;
      }
      if (inFlightRoles.has(role)) {
        console.log(`[local-agent] role prompt reload already running for role=${role} \u2014 skipping duplicate event`);
        return;
      }
      inFlightRoles.add(role);
      try {
        const { jobs } = await fetchPersistentAgentDefinitions(supabaseUrl, anonKey, companyId);
        const refreshed = jobs.find((job) => job.role === role);
        if (!refreshed) {
          console.log(`[local-agent] role prompt update ignored for role=${role} \u2014 role is not active/persistent in company ${companyId}`);
          return;
        }
        await executor.reloadPersistentAgent(refreshed, companyId);
        console.log(`[local-agent] Hot-reloaded persistent agent for role=${role}`);
      } catch (err) {
        console.error(`[local-agent] Failed to hot-reload role=${role}:`, err);
      } finally {
        inFlightRoles.delete(role);
      }
    })();
  });
  channel.subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      console.log(`[local-agent] Subscribed to role prompt hot-reload channel: ${channelName}`);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error(`[local-agent] Role prompt hot-reload channel error (status=${status}):`, err ?? "unknown error");
    }
  });
  return channel;
}
main().catch((err) => {
  console.error("[local-agent] Fatal startup error:", err);
  process.exit(1);
});
