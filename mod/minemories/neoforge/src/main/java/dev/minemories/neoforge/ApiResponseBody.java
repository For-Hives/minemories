package dev.minemories.neoforge;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;

final class ApiResponseBody implements HttpResponse.BodySubscriber<String> {
  static final int MAX_BYTES = 16 * 1024;
  private final HttpResponse.BodySubscriber<String> delegate =
      HttpResponse.BodySubscribers.ofString(StandardCharsets.UTF_8);
  private Flow.Subscription subscription;
  private int received;
  private boolean finished;

  static HttpResponse.BodyHandler<String> bounded() {
    return ignored -> new ApiResponseBody();
  }

  @Override
  public CompletionStage<String> getBody() {
    return delegate.getBody();
  }

  @Override
  public void onSubscribe(Flow.Subscription value) {
    subscription = value;
    delegate.onSubscribe(value);
  }

  @Override
  public void onNext(List<ByteBuffer> buffers) {
    if (finished) return;
    for (ByteBuffer buffer : buffers) {
      if (buffer.remaining() > MAX_BYTES - received) {
        finished = true;
        subscription.cancel();
        delegate.onError(new IOException("Réponse API trop volumineuse."));
        return;
      }
      received += buffer.remaining();
    }
    delegate.onNext(buffers);
  }

  @Override
  public void onError(Throwable error) {
    if (finished) return;
    finished = true;
    delegate.onError(error);
  }

  @Override
  public void onComplete() {
    if (finished) return;
    finished = true;
    delegate.onComplete();
  }
}
