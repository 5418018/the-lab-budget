# 🐙 GitHub로 실시간 연동 및 무료 웹 배포하는 법

GitHub를 활용하면 **별도의 호스팅 사이트(Vercel 등) 가입 없이 GitHub 하나만으로** 무료 웹 호스팅과 실시간 업데이트를 모두 해결할 수 있습니다!

특히 **GitHub Actions 자동화 파이프라인**을 탑재해 두었기 때문에, **GitHub 웹사이트에 새 엑셀 파일만 올리면 웹사이트가 1분 만에 자동으로 갱신**됩니다.

---

### 방법 A. [완전 자동화] 엑셀 파일을 GitHub에 올리면 자동 반영 (강력 추천 🚀)

```mermaid
graph LR
    A["관리자 (엑셀 수정 후 GitHub에 업로드)"] --> B["GitHub 저장소"]
    B -->|"GitHub Actions 자동 실행"| C["엑셀 분석 & data.js 자동 생성"]
    C -->|"10초 만에 자동 배포"| D["📱 GitHub Pages (https://아이디.github.io/저장소명)"]
```

#### 1단계: GitHub에 새 저장소(Repository) 만들기
1. [GitHub(github.com)](https://github.com)에 로그인합니다.
2. 우측 상단 `+` 버튼 → **`New repository`** 클릭
3. 저장소 이름(Repository name) 입력 (예: `the-lab-budget`)
4. **Public** 선택 (GitHub Pages 무료 호스팅용) 후 **`Create repository`** 클릭

#### 2단계: 내 컴퓨터 파일들을 GitHub로 올리기
명령 프롬프트(CMD) 또는 PowerShell에서 아래 4줄을 실행합니다:
```bash
cd c:\Users\stils\Downloads\anti
git init
git add .
git commit -m "Initial commit: THE 연구소 회계 대시보드"
git branch -M main
git remote add origin https://github.com/<내깃허브아이디>/<저장소이름>.git
git push -u origin main
```
*(GitHub에 익숙하지 않으시다면, GitHub 웹 화면에서 [uploading an existing file]을 눌러 폴더 안의 파일들을 마우스로 드래그해서 올려도 됩니다)*

#### 3단계: GitHub Pages 켜기 (최초 1회만 설정)
1. GitHub 저장소 상단 메뉴의 **`[Settings]`** 클릭
2. 좌측 사이드바의 **`[Pages]`** 클릭
3. **Build and deployment > Source** 옵션을:
   - `Deploy from a branch` 대신 **`GitHub Actions`**로 선택!
4. 이제 설정 끝입니다! 약 1분 후 저장소 상단에 **`https://<내아이디>.github.io/<저장소이름>`** 주소가 생성됩니다.

---

### 🔄 앞으로 장부를 업데이트하는 방법 (초간단)
1. 평소처럼 엑셀을 작성합니다.
2. GitHub 저장소 페이지에서 **`Add file` → `Upload files`**를 누르고, 수정한 엑셀 파일을 드래그하여 올린 뒤 **`Commit changes`** 버튼을 누릅니다.
3. **GitHub Actions가 백그라운드에서 알아서 엑셀을 읽어 대시보드를 최신으로 갱신**합니다!
4. 조직원들은 휴대폰에서 원래 링크 그대로 들어가면 최신 장부를 보게 됩니다.

---

### 방법 B. GitHub Pages(호스팅) + 구글 스프레드시트(실시간 입력) 조합

- 웹사이트는 GitHub Pages 주소(`https://아이디.github.io/저장소`)를 사용하고,
- 실시간 데이터는 구글 스프레드시트 링크를 연동하는 방식도 그대로 작동합니다.
- 조직원 입장에서는 깔끔한 GitHub 공식 도메인으로 접속할 수 있습니다.
