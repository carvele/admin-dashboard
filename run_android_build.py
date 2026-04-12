import subprocess
import os

project_dir = os.path.abspath(os.path.join(os.getcwd(), '..', 'bautistaProject'))
print(f"Building Android project at: {project_dir}")

try:
    result = subprocess.run(
        ['cmd.exe', '/c', 'gradlew.bat', 'assembleDebug'],
        cwd=project_dir,
        capture_output=True,
        text=True
    )
    print("STDOUT:")
    print(result.stdout)
    print("STDERR:")
    print(result.stderr)
    print(f"Return code: {result.returncode}")
except Exception as e:
    print(f"Failed to execute: {e}")
