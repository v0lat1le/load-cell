import os
import shutil
import gzip

Import("env")


env.AddCustomTarget(
    "serve",
    dependencies = [],
    actions = ["python -m http.server -d www"],
    title="Serve",
    description="Run HTTP server serving files from www folder",
    always_build=True
)

def prep_www_files_for_fs(*args, **kwargs):
    shutil.rmtree('data/www')
    for root, dirs, files in os.walk('www'):
        for file in files:
            print(f"Packing {file}...")
            with open(os.path.join(root, file), 'rb') as f:
                data = gzip.compress(f.read(), compresslevel=9)
            os.makedirs(os.path.join('data', root), exist_ok=True)
            with open(os.path.join('data', root, file+'.gz'), 'wb') as f:
                f.write(data)

env.AddCustomTarget(
    "prep_www",
    dependencies = [],
    actions = [prep_www_files_for_fs],
    title="Prep WWW",
    description="GZip files from 'www' and put them into 'data/www'",
    always_build=True
)
env.Depends('buildfs', 'prep_www')
