"""Prove architecture validation rejects deliberately broken module boundaries."""
from pathlib import Path
import importlib.util,json,shutil,tempfile
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('module_contract_check',ROOT/'scripts/check-module-contracts.py')
checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)

def reject_contract_mutation(name,mutate):
    with tempfile.TemporaryDirectory(prefix='pi-contract-test-') as temporary:
        root=Path(temporary)
        for folder in ('architecture','contracts'):shutil.copytree(ROOT/folder,root/folder)
        mutate(root)
        try:checker.check_module_contracts(root)
        except AssertionError:return
        raise AssertionError('MUTATION_SURVIVED: '+name)

def change_module(root,name,change):
    path=root/'architecture/modules'/f'{name}.json';data=json.loads(path.read_text());change(data);path.write_text(json.dumps(data))
reject_contract_mutation('missing consumed operation',lambda r:change_module(r,'fleet',lambda m:m['consumes']['mr'].append('invented_operation')))
reject_contract_mutation('undeclared dependency',lambda r:change_module(r,'fleet',lambda m:m['consumes'].update({'jira':['get']})))
reject_contract_mutation('dependency cycle',lambda r:change_module(r,'tool-protocol',lambda m:m['dependencies'].append('foundation')))
reject_contract_mutation('schema drift',lambda r:change_module(r,'mr',lambda m:m['operations']['status']['input_schema'].update({'required':['missing_field']})))
def illegal_import(root):
    folder=root/'src/fleet';folder.mkdir(parents=True);(folder/'fleet-port.js').write_text("import { secret } from '../jira/private-transport.js';\n")
reject_contract_mutation('private undeclared import',illegal_import)
print('5 deliberate architecture violations rejected')
