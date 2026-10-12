"""Concrete policy regression checks without touching the local firewall."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('vps-port-guard.sh')

class PrivatePortsTests(unittest.TestCase):
    def test_external_ipv4_and_ipv6_ports(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            log = root / 'calls'
            for name in ('iptables', 'ip6tables'):
                binary = root / name
                binary.write_text('#!/bin/sh\necho "$(basename "$0") $*" >> "$CALL_LOG"\ncase " $* " in *" -C "*) exit 1;; esac\n')
                binary.chmod(0o700)
            subprocess.run(['sh', str(SCRIPT), 'enp6s0'], check=True,
                           env={**os.environ, 'PATH': folder+':'+os.environ['PATH'], 'CALL_LOG': str(log)})
            lines = log.read_text().splitlines()
            for family in ('iptables', 'ip6tables'):
                self.assertIn(f'{family} -w -t mangle -A ZUI-PRIVATE-PORTS -p tcp -m multiport --dports 5432,6543,8000,8100,3100 -j DROP', lines)
                self.assertIn(f'{family} -w -t mangle -I PREROUTING 1 -i enp6s0 -j ZUI-PRIVATE-PORTS', lines)

    def test_invalid_interface_rejected(self):
        result = subprocess.run(['sh', str(SCRIPT), 'enp6s0;bad'], capture_output=True)
        self.assertEqual(result.returncode, 1)

if __name__ == '__main__':
    unittest.main()