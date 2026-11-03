#!/usr/bin/env python3
"""Exercise deliberate worktree violations and missing Covenant evidence in disposable copies."""
from pathlib import Path
import json,os,shutil,subprocess,tempfile,time
import yaml
ROOT=Path(__file__).resolve().parents[1]
BINARY=os.environ.get('COVENANT_BIN','covenant')

def sandbox_copy(root):
    for name in ('src','contracts','architecture','tools','capabilities','commands'):
        shutil.copytree(ROOT/name,root/name)
    for name in ('package.json','package-lock.json','tsconfig.json','vitest.config.ts','covenant.yaml'):shutil.copy(ROOT/name,root/name)
    (root/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)

results=[]
for name,relative,old,new,test in [
    ('bypass-ahead-protection','src/worktree/removal/remove.ts','if (Number(count) > 0)','if (false)','worktree.protects-ahead-and-unknown'),
    ('bypass-task-validation','src/worktree/model.ts','/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u','/.*/u','worktree.safe-creation'),
]:
    with tempfile.TemporaryDirectory(prefix='covenant-worktree-fault-') as temporary:
        root=Path(temporary);sandbox_copy(root);path=root/relative;source=path.read_text();assert old in source
        path.write_text(source.replace(old,new,1))
        run=subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run','src/worktree','-t','covenant:'+test,'--reporter=dot'],cwd=root,capture_output=True,text=True,timeout=60)
        output=run.stdout+run.stderr
        assert run.returncode==1 and 'AssertionError' in output and test in output,output
        results.append({'fault':name,'detected_by':test,'outcome':'rejected','diagnostic':output})
with tempfile.TemporaryDirectory(prefix='covenant-worktree-evidence-') as temporary:
    root=Path(temporary);sandbox_copy(root)
    path=root/'contracts/worktree/verification.yaml';document=yaml.safe_load(path.read_text());document['bindings'][0]['tests']=['worktree.nonexistent-evidence'];path.write_text(yaml.safe_dump(document,sort_keys=False))
    run=subprocess.run([BINARY,'--project',str(root),'--json','check','--obligation','WORKTREE-001'],capture_output=True,text=True,timeout=90)
    report=json.loads(run.stdout)
    assert run.returncode!=0 and report.get('report',{}).get('outcome')!='pass',report
    failures=[o for o in report['report']['obligations'] if o['id']=='WORKTREE-001']
    assert failures and all(o['outcome']!='verified' for o in failures),failures
    results.append({'fault':'missing-executable-evidence','outcome':'rejected','covenant_result':report})
output=ROOT/'.covenant/probes'/str(time.time_ns());output.mkdir(parents=True)
(output/'worktree-probes.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'deliberate_violations_rejected':len(results),'evidence':str(output/'worktree-probes.json'),'note':'Controlled probes, not a Stryker mutation score.'}))
