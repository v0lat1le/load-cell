import os
import gzip

Import("env")


def dump_data(data):
    return ''.join('\\x{:02x}'.format(x) for x in data)

def www_files_as_routes(dest_path):
    with open(dest_path, 'w') as dest:
        for root, dirs, files in os.walk('www'):
            for file in files:
                print(f'Packing {file}...')
                with open(os.path.join(root, file), 'rb') as f:
                    data = gzip.compress(f.read(), compresslevel=9)
                dest.write(f'    {{"/{file}"sv, "GET"sv, [](WiFiClient& client, HttpRequest& request) {{ serve_static(client, request, "{dump_data(data)}"sv); }}}},\n')

dest_folder = env.subst("$BUILD_DIR")+'/generated'
os.mkdir(dest_folder)
www_files_as_routes(dest_folder+'/static_routes.h')
env.Append(CPPPATH=[dest_folder])
