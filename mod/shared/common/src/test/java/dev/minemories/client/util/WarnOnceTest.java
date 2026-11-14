package dev.minemories.client.util;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;

class WarnOnceTest {
  @Test
  void logsTheFirstProblemOnlyUntilReset() {
    List<String> lines = new ArrayList<>();
    Logger logger =
        (Logger)
            Proxy.newProxyInstance(
                getClass().getClassLoader(),
                new Class<?>[] {Logger.class},
                (proxy, method, arguments) -> {
                  if (method.getName().equals("warn"))
                    lines.add(arguments[1] + ": " + arguments[2]);
                  return null;
                });
    var once = new WarnOnce(logger, "Ships are not captured");

    once.warn(new IllegalStateException("first"));
    once.warn(new IllegalStateException("second"));
    assertEquals(List.of("Ships are not captured: java.lang.IllegalStateException: first"), lines);

    once.reset();
    once.warn(new IllegalStateException("third"));
    assertEquals(2, lines.size());
  }
}
