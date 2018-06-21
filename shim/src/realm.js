import { createRealmFacade } from './realmFacade';
import { createNewUnsafeRec, createCurrentUnsafeRec } from './unsafeRec';
import { createSafeEvaluator, createFunctionEvaluator } from './evaluators';
import { getStdLib } from './stdlib';
import { getSharedIntrinsics } from './intrinsics';
import { create, defineProperties, freeze } from './commons';

// Create a registry to mimic a private static members on the realm classes.
// We define it in the same module and do not export it.

const UnsafeRecForRealm = new WeakMap();

function getUnsafeRecForRealm(Realm) {
  if (Object(Realm) !== Realm) {
    // Detect non-objects.
    throw new TypeError();
  }
  // spec just says throw TypeError
  // todo: but shim should include a message
  if (!UnsafeRecForRealm.has(Realm)) {
    // Realm has no unsafeRec. Shoud not proceed.
    throw new TypeError();
  }
  return UnsafeRecForRealm.get(Realm);
}

function setUnsafeRecForRealm(Realm, unsafeRec) {
  if (Object(Realm) !== Realm) {
    // Detect non-objects.
    throw new TypeError();
  }
  // spec just says throw TypeError
  // todo: but shim should include a message
  if (UnsafeRecForRealm.has(Realm)) {
    // Attempt to change an existing unsafeRec on a Realm. Shoud not proceed.
    throw new TypeError();
  }
  UnsafeRecForRealm.set(Realm, unsafeRec);
}

// Create a registry to mimic a private members on the realm imtances.
// We define it in the same module and do not export it.

const RealmRecForRealmInstance = new WeakMap();

function getRealmRecForRealmInstance(realm) {
  if (Object(realm) !== realm) {
    // Detect non-objects.
    throw new TypeError();
  }
  // spec just says throw TypeError
  // todo: but shim should include a message
  if (!RealmRecForRealmInstance.has(realm)) {
    // Realm instance has no realmRec. Shoud not proceed.
    throw new TypeError();
  }
  return RealmRecForRealmInstance.get(realm);
}

function setRealmRecForRealmInstance(realm, realmRec) {
  if (Object(realm) !== realm) {
    // Detect non-objects.
    throw new TypeError();
  }
  // spec just says throw TypeError
  // todo: but shim should include a message
  if (RealmRecForRealmInstance.has(realm)) {
    // Attempt to change an existing realmRec on a realm instance. Shoud not proceed.
    throw new TypeError();
  }
  RealmRecForRealmInstance.set(realm, realmRec);
}

// initialize the global variables for the new Realm
function setDefaultBindings(realmRec) {
  const descs = getStdLib(realmRec);
  defineProperties(realmRec.safeGlobal, descs);
}

function createRealmRec(unsafeRec) {
  const sharedIntrinsics = getSharedIntrinsics(unsafeRec);
  const safeGlobal = create(sharedIntrinsics.ObjectPrototype);

  const safeEval = createSafeEvaluator(unsafeRec, safeGlobal);
  const safeFunction = createFunctionEvaluator(unsafeRec, safeEval);

  const realmRec = freeze({
    sharedIntrinsics,
    safeGlobal,
    safeEval,
    safeFunction
  });

  setDefaultBindings(realmRec);
  return realmRec;
}

class BaseRealm {
  constructor(options) {
    options = Object(options); // Todo: sanitize

    let unsafeRec;
    if (
      options.intrinsics === 'inherit' &&
      options.isDirectEval === 'inherit' &&
      options.transform === 'inherit'
    ) {
      // In "inherit" mode, we create a compartment realm and inherit
      // the context since we share the intrinsics. We create a new
      // set to allow us to define eval() and Function() for the realm.

      // Class constructor only has a [[Construct]] behavior and not
      // a call behavior, therefore the use of "this" cannot be bound
      // by an adversary.

      // note: this 'this' comes from the Reflect.construct call in the
      // facade we build above, inside buildChildRealm().

      // todo: what if 'this' is e.g. Window but set to inherit from a Realm?
      // confused deputy / private field question. A: it can't be, we're in a
      // constructor, and constructors can't be invoked directly as
      // functions, using a class protects us here
      unsafeRec = getUnsafeRecForRealm(this.constructor);
    } else if (
      options.intrinsics === undefined &&
      options.isDirectEval === undefined &&
      options.transform === undefined
    ) {
      // In 'undefined' mode, intrinics are not provided, we create a root
      // realm using the fresh set of new intrinics from a new context.

      // The unsafe record is returned with its constructors repaired.
      unsafeRec = createNewUnsafeRec();

      // Define newRealm onto new unsafeGlobal, so it can be copied onto the
      // safeGlobal like the rest of the intrinsics.
      const newRealm = createRealmFacade(unsafeRec, BaseRealm);
      unsafeRec.unsafeGlobal.Realm = newRealm;

      // todo: make a library function named 'register', add more checking
      // todo: use 'newRealm' as the key, not 'newRealm.prototype'
      setUnsafeRecForRealm(newRealm, unsafeRec);
    } else {
      // note this would leak the parent TypeError, from which the child can
      // access .prototype and the parent's intrinsics, except that the Realm
      // facade catches all errors and translates them into local Error types
      throw new TypeError('Realm only supports undefined or "inherited" intrinsics.');
    }
    const realmRec = createRealmRec(unsafeRec);
    // todo: is this where we run shims? but only in RootRealms, not compartments

    // note: we never invoke a method on 'this', we only use it as a key in
    // the weakmap. Never say "this." anywhere.
    setRealmRecForRealmInstance(this, realmRec);
  }
  get global() {
    const { safeGlobal } = getRealmRecForRealmInstance(this);
    return safeGlobal;
  }
  evaluate(x) {
    const { safeEval } = getRealmRecForRealmInstance(this);
    return safeEval(x);
  }
}

// Create the current unsafeRec from the current "primal" realm (the realm
// where the Realm shim is loaded and executed).
const currentUnsafeRec = createCurrentUnsafeRec();
const Realm = createRealmFacade(currentUnsafeRec, BaseRealm);
setUnsafeRecForRealm(Realm, currentUnsafeRec);
currentUnsafeRec.unsafeGlobal.Realm = Realm;

export default Realm;