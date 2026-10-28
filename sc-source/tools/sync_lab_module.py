"""Copy the independently maintained lab module into the public Pages tree."""
from pathlib import Path
import shutil
project=Path(__file__).resolve().parents[1]
source=project/'modules'/'bimetallic'
target=project.parent/'public'/'sc'/'lab'/'bimetallic'
shutil.copytree(source,target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('README.md'))
print(target)
