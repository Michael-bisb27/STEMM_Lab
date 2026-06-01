const { device, element, by, expect, waitFor } = require('detox');

describe('Parachute Activity Full App Flow - Production Auth & Activity Bypass', () => {
  beforeAll(async () => {
    await device.launchApp({ 
      newInstance: true,
      launchArgs: { detoxSkipToFinish: true } 
    });
  });

  it('should complete onboarding, log in with test credentials, clear checklist, and complete finish actions', async () => {
    
    // ==========================================
    // STEP 1: ONBOARDING CAROUSEL
    // ==========================================
    await waitFor(element(by.text('Guide your study'))).toBeVisible().withTimeout(10000);
    await new Promise(resolve => setTimeout(resolve, 2000));

    await element(by.id('intro-dot-1')).tap();
    await new Promise(resolve => setTimeout(resolve, 600)); 
    await waitFor(element(by.text('Fun Experiments'))).toBeVisible().withTimeout(6000);
    await new Promise(resolve => setTimeout(resolve, 2000));

    await element(by.id('intro-dot-2')).tap();
    await new Promise(resolve => setTimeout(resolve, 600));
    await waitFor(element(by.text('Be your path'))).toBeVisible().withTimeout(6000);
    await new Promise(resolve => setTimeout(resolve, 800));

    await waitFor(element(by.id('continueButton')))
      .toBeVisible()
      .whileElement(by.id('bottomScrollView'))
      .scroll(100, 'down');

    await element(by.id('continueButton')).tap();

    // ==========================================
    // STEP 2: ACTUAL USER AUTHENTICATION
    // ==========================================
    // ==========================================
    // STEP 2: ACTUAL USER AUTHENTICATION
    // ==========================================
    await waitFor(element(by.text('🏫 Teacher Portal'))).toExist().withTimeout(5000);

    const signInLink = element(by.id('signInButton'));
    await waitFor(signInLink)
      .toBeVisible()
      .whileElement(by.type('UIScrollView')) 
      .scroll(100, 'down');

    await signInLink.tap();

    // Define our targets
    const emailInput = element(by.id('emailInput'));
    const passwordInput = element(by.id('passwordInput'));
    const signInSubmitButton = element(by.id('signInSubmitButton'));
    const outsideArea = element(by.id('signinTitle')); // The title target

    // Wait for the form to load
    await waitFor(emailInput).toBeVisible().withTimeout(5000);

    // 1. Input email
    await emailInput.typeText('megan.gale@gmail.com');

    // 2. Click outside to drop the textbox
    await outsideArea.tap();
    await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for keyboard collapse animation

    // 3. Input password
    await passwordInput.typeText('Megan.gale1');

    // 4. Click outside to drop the textbox
    await outsideArea.tap();
    await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for keyboard collapse animation

    // 5. Click sign in
    await signInSubmitButton.tap();
    // ==========================================
    // STEP 3: DASHBOARD & ACTIVITY ACCESS
    // ==========================================
    // This should now succeed because the application successfully handles the redirect to /home
    const parachuteCard = element(by.text('Parachute'));
    await waitFor(parachuteCard).toBeVisible().withTimeout(12000); // Bumped slightly to allow for Firebase Network requests
    await parachuteCard.tap();

    const getReadyButton = element(by.text('Get Ready'));
    await waitFor(getReadyButton).toBeVisible().withTimeout(3000);
    await getReadyButton.tap();

    // ==========================================
    // STEP 4: PRE-FLIGHT CHECKLIST CONFIGURATION
    // ==========================================
    await waitFor(element(by.id('checklist-box-0'))).toBeVisible().withTimeout(3000);
    await element(by.id('checklist-box-0')).tap();
    await element(by.id('checklist-box-1')).tap();
    await element(by.id('checklist-box-2')).tap();
    await element(by.id('checklist-box-3')).tap();

    await element(by.id('checklistScrollView')).scroll(300, 'down');
    await element(by.text('Start')).tap();

    // ==========================================
    // STEP 5: ACTIVITY FINISH & UPLOAD
    // ==========================================
    const uploadPhotoButton = element(by.id('uploadPhotoButton'));
    const commentTextInput = element(by.id('commentTextInput'));
    const finishSubmitButton = element(by.id('finishSubmitButton'));

    await waitFor(uploadPhotoButton).toBeVisible().withTimeout(5000);
    await uploadPhotoButton.tap();
    await commentTextInput.typeText('Simulation completed successfully. Parachute structural stability verified.');
    await finishSubmitButton.tap();

    await expect(element(by.text('Activity Completed!'))).toBeVisible();
  });
});