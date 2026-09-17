//! Sync engine library crate — CRDT, sync transport, and markdown parse/serialize.
//!
//! This crate has no Tauri dependency by design. It must compile and pass tests
//! independently, so it can later power the headless server binary without forking.
//! See docs/ARCHITECTURE.md "Shared sync engine crate" for the boundary rules.

pub mod snapshot;
pub mod format;

#[cfg(test)]
mod tests {
    #[test]
    fn crate_compiles_without_tauri() {
        // If this test runs, the boundary is intact.
    }
}
