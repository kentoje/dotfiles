#!/usr/bin/env python3
"""Validate module contracts and reject undeclared dependencies before implementation."""
from pathlib import Path
import argparse,json,re,sys
import yaml
from jsonschema import Draft202012Validator


def check_module_contracts(root):
    graph=json.loads((root/'architecture/module-graph.json').read_text())
    modules={name:json.loads((root/'architecture/modules'/f'{name}.json').read_text()) for name in graph['modules']}
    contracts={p.parent.name:yaml.safe_load(p.read_text()) for p in (root/'contracts').glob('*/contract.yaml')}
    assert set(modules)==set(contracts),'MODULE_COVERAGE: every component needs an interface'
    visiting=set();visited=set()
    def visit_module(name):
        assert name not in visiting,f'DEPENDENCY_CYCLE: {name}'
        if name in visited:return
        visiting.add(name)
        for dependency in modules[name]['dependencies']:
            assert dependency in modules,f'UNKNOWN_DEPENDENCY: {name} -> {dependency}'
            visit_module(dependency)
        visiting.remove(name);visited.add(name)
    for definition_path in root.rglob('definition.json'):
        definition=json.loads(definition_path.read_text())
        if definition.get('component') not in modules or definition['component']=='jira-preflight':continue
        for action in definition['actions']:
            port=modules[definition['component']]['operations'][action['name']]
            for field in ('input_schema','output_schema','effect','rules'):
                assert action[field]==port[field],f'PUBLIC_PORT_DRIFT: {definition["component"]}.{action["name"]}: {field}'
    checks=0
    for name,module in modules.items():
        visit_module(name)
        assert module['owner']==name and module['interface_id']==name+'-v1','INTERFACE_IDENTITY: mismatched owner'
        assert module['implementation_root']=='src/'+name+'/' and module['test_root']=='tests/'+name+'/', 'MODULE_OWNERSHIP: roots must be exclusive'
        assert contracts[name]['dependencies']==module['dependencies'],'DEPENDENCY_DRIFT: native and architecture contracts differ'
        assert contracts[name]['interfaces']==[{'name':name+'-v1','language':'typescript','module':'architecture/modules/'+name+'.json','export':name+'-v1'}],'INTERFACE_DRIFT: native interface differs'
        assert set(module['consumes'])==set(module['dependencies']),'PORT_COVERAGE: dependencies need exact consumed ports'
        for provider,operations in module['consumes'].items():
            assert len(operations)==len(set(operations)),'DUPLICATE_PORT: repeated operation'
            assert set(operations)<=modules[provider]['operations'].keys(),f'UNKNOWN_PORT: {name} -> {provider}'
        for operation,port in module['operations'].items():
            for direction in ('input_schema','output_schema'):Draft202012Validator.check_schema(port[direction])
            fixtures=json.loads((root/'architecture/fixtures'/f'{name}--{operation}.json').read_text())
            assert {x['direction'] for x in fixtures}>={'input_schema','output_schema'},'FIXTURE_COVERAGE: both directions required'
            for direction in ('input_schema','output_schema'):
                assert {x['valid'] for x in fixtures if x['direction']==direction}=={True,False},'FIXTURE_COVERAGE: acceptance and rejection required'
            for fixture in fixtures:
                actual=Draft202012Validator(port[fixture['direction']]).is_valid(fixture['payload'])
                assert actual==fixture['valid'],f'FIXTURE_MISMATCH: {name}.{operation}: {fixture["name"]}'
                checks+=1
        # Future implementation imports may use only the explicit module port entrypoint.
        for source in (root/module['implementation_root']).rglob('*') if (root/module['implementation_root']).exists() else []:
            if source.suffix not in ('.ts','.tsx','.js','.mjs'):continue
            for target in re.findall(r'(?:from\s*|import\s*\(|require\s*\()?[\"\']([^\"\']+)[\"\']',source.read_text()):
                if not target.startswith('.'):continue
                resolved=(source.parent/target).resolve()
                try:parts=resolved.relative_to(root/'src').parts
                except ValueError:raise AssertionError(f'IMPORT_ESCAPE: {source}: {target}')
                if parts[0]!=name:
                    assert parts[0] in module['dependencies'],f'UNDECLARED_IMPORT: {name} -> {parts[0]}'
                    assert len(parts)==2 and parts[1] in ('module-port','module-port.ts'),f'PRIVATE_MODULE_IMPORT: {source}: {target}'
    return {'modules':len(modules),'operations':sum(len(m['operations']) for m in modules.values()),'schema_fixture_checks':checks,'implementation_behavior':'not implemented or verified'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);args=parser.parse_args()
    try:print(json.dumps(check_module_contracts(args.root)))
    except (AssertionError,KeyError,ValueError,OSError) as error:
        print(str(error),file=sys.stderr);sys.exit(1)
