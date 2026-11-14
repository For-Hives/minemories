package dev.minemories.client.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class ReflectTest {
  public interface Pose {
    double x();

    String name();
  }

  /** Not public, like a mod's implementation class: only callable through {@link Pose}. */
  private static final class Hidden implements Pose {
    @Override
    public double x() {
      return 2.5;
    }

    @Override
    public String name() {
      return "hidden";
    }
  }

  @Test
  void callsANonPublicImplementationThroughItsPublicInterface() throws Exception {
    Object hidden = new Hidden();
    assertEquals(Pose.class, Reflect.method(hidden, "x").getDeclaringClass());
    assertEquals(2.5, Reflect.number(hidden, "x"));
    assertEquals("hidden", Reflect.call(hidden, "name"));
  }

  @Test
  void takesTheFirstNameTheTargetAnswers() throws Exception {
    assertEquals("hidden", Reflect.call(new Hidden(), "getName", "name"));
  }

  @Test
  void anUnknownApiIsAMissingMethod() {
    Object hidden = new Hidden();
    assertThrows(NoSuchMethodException.class, () -> Reflect.call(hidden, "getMass", "mass"));
    assertThrows(NoSuchMethodException.class, () -> Reflect.call(null, "x"));
    assertThrows(NoSuchMethodException.class, () -> Reflect.number(hidden, "name"));
    assertThrows(NoSuchMethodException.class, () -> Reflect.method(hidden, "x", int.class));
  }
}
