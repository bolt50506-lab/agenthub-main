# Scratch-branch smoke test for the boot guard logic.
# This file is intentionally not used by production.

def boot_error_is_nonfatal(message: str) -> bool:
    return message == 'Existing Ali profile is missing'


def test_missing_ali_is_nonfatal():
    assert boot_error_is_nonfatal('Existing Ali profile is missing')


def test_other_boot_errors_still_fail():
    assert not boot_error_is_nonfatal('OmniVoice GGUF missing')
