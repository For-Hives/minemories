package dev.minemories.client.util;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

/**
 * Calls into another mod's API by name, so none of its classes is linked unless the mod is there.
 * Every lookup goes through the public declaration of a method: a mod's implementation classes are
 * not always public, and reflection may only call them through the public type they implement.
 */
public final class Reflect {
  private Reflect() {}

  /** The first of {@code names} the target answers, called with no argument. */
  public static Object call(Object target, String... names) throws ReflectiveOperationException {
    if (target == null) throw new NoSuchMethodException(names[0]);
    NoSuchMethodException missing = null;
    for (String name : names) {
      try {
        return method(target, name).invoke(target);
      } catch (NoSuchMethodException error) {
        missing = error;
      }
    }
    throw missing;
  }

  /** A numeric getter's value; anything else is an API this code does not know. */
  public static double number(Object target, String name) throws ReflectiveOperationException {
    Object value = call(target, name);
    if (!(value instanceof Number number)) throw new NoSuchMethodException(name);
    return number.doubleValue();
  }

  /** The public declaration of a method of {@code target}'s class. */
  public static Method method(Object target, String name, Class<?>... parameters)
      throws NoSuchMethodException {
    Method found = publicMethod(target.getClass(), name, parameters);
    if (found == null) throw new NoSuchMethodException(name);
    return found;
  }

  private static Method publicMethod(Class<?> type, String name, Class<?>... parameters) {
    if (type == null) return null;
    if (Modifier.isPublic(type.getModifiers())) {
      try {
        return type.getMethod(name, parameters);
      } catch (NoSuchMethodException absent) {
        return null;
      }
    }
    for (Class<?> contract : type.getInterfaces()) {
      Method found = publicMethod(contract, name, parameters);
      if (found != null) return found;
    }
    return publicMethod(type.getSuperclass(), name, parameters);
  }
}
