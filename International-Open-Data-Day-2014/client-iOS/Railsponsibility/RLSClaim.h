//
//  RLSClaim.h
//  Railsponsibility
//
//  Created by Matias Piipari on 22/02/2014.
//  Copyright (c) 2014 Railsponsibility. All rights reserved.
//

#import <Foundation/Foundation.h>

#import "JSONModel.h"

@interface RLSClaim : JSONModel

#pragma mark - Name

@property (readwrite) NSString *title;
@property (readwrite) NSString *firstName;
@property (readwrite) NSString *lastName;
@property (readwrite) NSString *initials;

#pragma mark - Address

@property (readwrite) NSString *houseName;
@property (readwrite) NSString *addressLine1;
@property (readwrite) NSString *addressLine2;

@property (readwrite) NSString *town;
@property (readwrite) NSString *postCode;
@property (readwrite) NSString *telephoneNumber;
@property (readwrite) NSString *email;

#pragma mark - Journey

@property (readwrite) NSString *daytimeTelephone;


@end