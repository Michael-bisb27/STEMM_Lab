const { device, element, by, expect, waitFor } = require('detox');

// 🌟 FORCE JEST OVERRIDE FOR THIS SPEC FILE (Prevents the 120000ms global clamp)
jest.setTimeout(240000);

describe('Parachute Activity Full App Flow - Production Auth & Activity Bypass', () => {
  beforeAll(async () => {
    await device.launchApp({ 
      newInstance: true,
      launchArgs: { detoxSkipToFinish: true },
      permissions: {
        location: 'inuse',
        photos: 'limited'
      }
    });

    // FORCE SIMULATOR GPS TO SUDIRMAN, JAKARTA
    await device.setLocation(-6.2183, 106.8025); 
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
    await waitFor(element(by.text('🏫 Teacher Portal'))).toExist().withTimeout(5000);

    const signInLink = element(by.id('signInButton'));
    await waitFor(signInLink)
      .toBeVisible()
      .whileElement(by.type('UIScrollView')) 
      .scroll(100, 'down');

    await signInLink.tap();

    const emailInput = element(by.id('emailInput'));
    const passwordInput = element(by.id('passwordInput'));
    const signInSubmitButton = element(by.id('signInSubmitButton'));
    const outsideArea = element(by.id('signinTitle')); 

    await waitFor(emailInput).toBeVisible().withTimeout(5000);

    await emailInput.typeText('megan.gale@gmail.com');
    await outsideArea.tap();
    await new Promise(resolve => setTimeout(resolve, 500)); 

    await passwordInput.typeText('Megan.gale1');
    await outsideArea.tap();
    await new Promise(resolve => setTimeout(resolve, 500)); 

    await signInSubmitButton.tap();
    await device.disableSynchronization();

    await new Promise(resolve => setTimeout(resolve, 4000));

    // ==========================================
    // STEP 3: DASHBOARD & ACTIVITY ACCESS
    // ==========================================
    const parachuteCard = element(by.id('challenge-card-eng1'));

    await parachuteCard.tap();
    await new Promise(resolve => setTimeout(resolve, 1500)); 

    await parachuteCard.tap();
    await new Promise(resolve => setTimeout(resolve, 2000));

    const parachuteScroll = element(by.id('parachuteScrollView'));
    await waitFor(parachuteScroll).toExist().withTimeout(10000);

    await element(by.id('parachuteTitleSection')).swipe('up', 'slow', 0.8);
    await new Promise(resolve => setTimeout(resolve, 1000)); 

    const getReadyButton = element(by.id('getReadyButton'));
    await getReadyButton.tap();

    // ==========================================
    // STEP 4: PRE-FLIGHT CHECKLIST CONFIGURATION
    // ==========================================
    const readyScroll = element(by.id('readyScrollView'));
    await waitFor(readyScroll).toBeVisible().withTimeout(8000);

    await element(by.id('mat-toy')).tap();
    await element(by.id('mat-surface')).tap();
    await element(by.id('mat-canopy')).tap();
    await element(by.id('mat-string')).tap();
    await element(by.id('mat-scissors')).tap();
    await element(by.id('mat-tape')).tap();

    await element(by.id('readyTitleSection')).swipe('up', 'fast', 0.9);
    await new Promise(resolve => setTimeout(resolve, 1000)); 

    await element(by.id('sensorCalibrateButton')).tap();
    await new Promise(resolve => setTimeout(resolve, 500));

    await element(by.id('teamDeploymentCheck')).tap();
    await new Promise(resolve => setTimeout(resolve, 500));

    await element(by.id('safeSpaceCheck')).tap();
    await new Promise(resolve => setTimeout(resolve, 500));

    const startDropSessionButton = element(by.id('startDropSessionButton'));
    await waitFor(startDropSessionButton).toBeVisible().withTimeout(4000);
    await startDropSessionButton.tap();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ==========================================
    // STEP 5: CORE EXPERIMENTAL TRIAL MATRIX (9 RUN LIFECYCLE)
    // ==========================================
    // Disable synchronization because the high frequency 10ms stopwatch text ticker 
    // loops will trigger automated tracking timeout stalls
    await device.disableSynchronization();

    await waitFor(element(by.id('physicsProfileHeader'))).toBeVisible().withTimeout(6000);

    for (let i = 1; i <= 9; i++) {
      // A. Release payload structure
      await waitFor(element(by.id('releasePayloadButton'))).toBeVisible().withTimeout(4000);
      await element(by.id('releasePayloadButton')).tap();
      
      // B. Fall Window: Wait 1.3 seconds so it firmly clears the 1200ms layout validation threshold
      await new Promise(resolve => setTimeout(resolve, 1300));
      
      // C. Capture landing footprint parameters
      await element(by.text('CAPTURE IMPACT')).tap();
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // D. Select standard run advancement text routing labels
      const loggingButtonText = (i === 9) ? "[SYNCHRONIZE SESSION]" : "[Log & Move to Next Run]";
      await element(by.text(loggingButtonText)).tap();
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // E. Intercept mid-phase confirmation pop-up blocks (Triggered at Iteration 3 and 6)
      if (i === 3 || i === 6) {
        await waitFor(element(by.text('Acknowledge'))).toBeVisible().withTimeout(4000);
        await element(by.text('Acknowledge')).tap();
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    // Restore synchronization as the application navigates into the post-activity summary forms
    await device.enableSynchronization();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ==========================================
    // STEP 6: ACTIVITY FINISH & UPLOAD
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