use std::path::PathBuf;
use tracing_appender::{non_blocking::WorkerGuard, rolling};
use tracing_subscriber::{
    fmt::{self, time::LocalTime},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};

/// Holds the worker guard that keeps the non-blocking log writer flushing.
/// Must be stored for the lifetime of the app — dropping it silently stops log writes.
pub struct LoggingHandle {
    _guard: WorkerGuard,
}

/// Initialize structured logging.
///
/// - Writes to a rolling daily log file in `log_dir`.
/// - Also writes to stderr in development builds.
/// - Default level: info (overridable via RUST_LOG env var for development).
/// - Returns a handle that must be kept alive for the duration of the app.
pub fn init(log_dir: PathBuf) -> LoggingHandle {
    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = rolling::daily(&log_dir, "scalenote.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // JSON format to the file, human-readable to stderr in debug builds.
    let file_layer = fmt::layer()
        .json()
        .with_timer(LocalTime::rfc_3339())
        .with_writer(non_blocking);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    #[cfg(debug_assertions)]
    {
        let stderr_layer = fmt::layer()
            .with_timer(LocalTime::rfc_3339())
            .with_writer(std::io::stderr);

        tracing_subscriber::registry()
            .with(filter)
            .with(file_layer)
            .with(stderr_layer)
            .init();
    }

    #[cfg(not(debug_assertions))]
    {
        tracing_subscriber::registry()
            .with(filter)
            .with(file_layer)
            .init();
    }

    tracing::info!(
        log_dir = %log_dir.display(),
        "ScaleNote logging initialized"
    );

    LoggingHandle { _guard: guard }
}
