package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RenderedBudgetTest {
  @Test
  void manyDistinctEntityTexturesSkipTheExcessInsteadOfFailing() {
    var budget = new RenderedBudget();
    int registered = 0;
    for (int texture = 0; texture < 2000; texture++) {
      if (budget.admitTexture(registered)) registered++;
    }
    assertEquals(RenderedBudget.MAX_TEXTURES, registered);
    assertEquals(2000 - RenderedBudget.MAX_TEXTURES, budget.skippedTextures());
    assertTrue(budget.anySkipped());
  }

  @Test
  void textureBytesAreReservedUntilTheBudgetIsFull() {
    var budget = new RenderedBudget(10, 100, 4, 10);
    assertTrue(budget.admitBytes(60));
    assertFalse(budget.admitBytes(41));
    assertTrue(budget.admitBytes(40));
    assertFalse(budget.admitBytes(1));
    assertEquals(2, budget.skippedTextures());
  }

  @Test
  void passesBeyondTheLimitAreSkippedAndCounted() {
    var budget = new RenderedBudget(10, 100, 2, 10);
    assertTrue(budget.admitPass(0));
    assertTrue(budget.admitPass(1));
    assertFalse(budget.admitPass(2));
    assertEquals(1, budget.skippedPasses());
  }

  @Test
  void quadsBeyondTheLimitAreDropped() {
    var budget = new RenderedBudget(10, 100, 2, 2);
    assertTrue(budget.admitQuad());
    assertTrue(budget.admitQuad());
    assertFalse(budget.admitQuad());
    assertEquals(1, budget.skippedQuads());
  }

  @Test
  void untouchedBudgetReportsNothingAndSummaryHoldsOnlyCounts() {
    var budget = new RenderedBudget();
    assertFalse(budget.anySkipped());
    budget.admitPass(RenderedBudget.MAX_PASSES);
    assertEquals("skippedTextures=0, skippedPasses=1, skippedQuads=0", budget.summary());
  }
}
