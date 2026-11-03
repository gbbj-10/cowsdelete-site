//! Mucca CAD: no-JS stand-in for web-time (timings only used for diagnostics)
#[cfg(not(target_arch = "wasm32"))] pub use std::time::{Instant, SystemTime, Duration, UNIX_EPOCH};
#[cfg(target_arch = "wasm32")] pub use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(target_arch = "wasm32")]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Instant(u64);
#[cfg(target_arch = "wasm32")]
impl Instant {
    pub fn now() -> Self { Instant(0) }
    pub fn elapsed(&self) -> Duration { Duration::from_secs(0) }
    pub fn duration_since(&self, _e: Instant) -> Duration { Duration::from_secs(0) }
    pub fn saturating_duration_since(&self, _e: Instant) -> Duration { Duration::from_secs(0) }
}
