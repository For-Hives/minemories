package dev.minemories.client;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

final class StorageStatusClient {
  private StorageStatusClient() {}

  static CompletableFuture<StorageQuota> fetch(HttpClient http, String apiUrl, String token) {
    if (token == null || token.isBlank()) {
      return CompletableFuture.failedFuture(new IOException("Galerie non connectée."));
    }
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(apiUrl + "/api/mod/status"))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer " + token)
            .GET()
            .build();
    return http.sendAsync(request, ApiResponseBody.bounded())
        .thenApply(
            response -> {
              if (response.statusCode() != 200) {
                throw new CompletionException(
                    new StatusException(
                        response.statusCode() == 401
                            ? "Connexion expirée. Reconnecte ton compte."
                            : "Espace indisponible. Réessaie plus tard."));
              }
              try {
                return StorageQuota.parseStatus(response.body());
              } catch (RuntimeException error) {
                throw new CompletionException(
                    new StatusException("Cette API ne fournit pas un résumé de stockage valide."));
              }
            });
  }

  static final class StatusException extends IOException {
    private static final long serialVersionUID = 1L;

    StatusException(String message) {
      super(message);
    }
  }
}
